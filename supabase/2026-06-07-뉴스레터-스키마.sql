-- ============================================================
-- Phase 3-A 뉴스레터 자동 발송 스키마
-- 전역 발송 설정(어드민) + 발송 이력 + 수신자 로그(오픈율) + 수신거부 토큰
-- 실행: Supabase 대시보드 → SQL Editor
-- 의존: public.users(role), public.newsletter_subscriptions, public.set_updated_at()
-- ============================================================

-- ── 1) 전역 발송 설정 (싱글톤: 1행만 존재) ───────────────────────────
-- 발송 시간/요일/카드수를 어드민이 관리. per-user 주기는 폐기됨.
create table if not exists public.newsletter_settings (
  id            smallint primary key default 1,
  is_enabled    boolean  not null default false,
  send_hour_kst smallint not null default 8  check (send_hour_kst between 0 and 23),
  send_days     smallint[] not null default '{1}',  -- ISO 요일(1=월…7=일). 매일='{1,2,3,4,5,6,7}', 화·목='{2,4}'
  card_count    smallint not null default 5  check (card_count between 1 and 10),
  subject_tpl   text     not null default 'Insight Out 뉴스레터 · {date}',
  last_sent_on  date,                                 -- 멱등 키(KST 기준 마지막 발송일)
  updated_at    timestamptz not null default now(),
  constraint newsletter_settings_singleton check (id = 1)
);

insert into public.newsletter_settings (id) values (1) on conflict (id) do nothing;

create trigger set_newsletter_settings_updated_at
  before update on public.newsletter_settings
  for each row execute function public.set_updated_at();

-- ── 2) 발송 회차(이력) ──────────────────────────────────────────────
create table if not exists public.newsletter_issues (
  id            uuid primary key default gen_random_uuid(),
  sent_on       date    not null,
  subject       text    not null,
  content_ids   uuid[]  not null default '{}',
  recipient_cnt integer not null default 0,
  status        text    not null default 'pending',  -- pending|sent|partial|failed
  triggered_by  text    not null default 'cron',     -- cron|manual
  created_at    timestamptz not null default now()
);

-- ── 3) 회차별 수신자 로그(오픈율 추적) ──────────────────────────────
create table if not exists public.newsletter_recipients (
  id                uuid primary key default gen_random_uuid(),
  issue_id          uuid not null references public.newsletter_issues(id) on delete cascade,
  user_id           uuid references public.users(id) on delete set null,
  email             text not null,
  resend_message_id text,                            -- Resend 발송 응답 id (webhook 매칭 키)
  status            text not null default 'queued',  -- queued|sent|delivered|opened|bounced|failed
  delivered_at      timestamptz,
  opened_at         timestamptz,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists newsletter_recipients_issue_idx
  on public.newsletter_recipients (issue_id);
create unique index if not exists newsletter_recipients_msgid_idx
  on public.newsletter_recipients (resend_message_id)
  where resend_message_id is not null;

-- ── 4) 수신거부 토큰 (구독 테이블) — 이메일 링크 비로그인 해지용(법적 필수) ──
alter table public.newsletter_subscriptions
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists newsletter_subscriptions_unsub_token_idx
  on public.newsletter_subscriptions (unsubscribe_token);

-- ── 5) RLS (쓰기는 service_role 가 RLS 우회. 조회는 admin 만) ─────────
alter table public.newsletter_settings   enable row level security;
alter table public.newsletter_issues     enable row level security;
alter table public.newsletter_recipients enable row level security;

create policy "nl_settings: admin 조회" on public.newsletter_settings
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "nl_settings: admin 수정" on public.newsletter_settings
  for update using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "nl_issues: admin 조회" on public.newsletter_issues
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "nl_recipients: admin 조회" on public.newsletter_recipients
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ── 6) GRANT ────────────────────────────────────────────────────────
-- 주의: 이 테이블들은 어드민 전용 + 민감(수신자 이메일 포함)이라 anon 부여하지 않음.
-- (프로젝트 기본 규칙은 anon+authenticated 지만, 여기선 RLS admin-only + authenticated 만 부여가 안전.)
grant select          on public.newsletter_settings   to authenticated;
grant update          on public.newsletter_settings   to authenticated;
grant select          on public.newsletter_issues     to authenticated;
grant select          on public.newsletter_recipients to authenticated;
