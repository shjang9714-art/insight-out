-- ============================================================
-- 핸드오프 101 — 이슈 1급화 토대 (issues + issue_contents)
-- 수희 실행: Supabase → SQL Editor. 멱등. SSOT: supabase/schema.sql 반영(#6).
-- 코드는 미적용이어도 try/catch 격리(크롤 무중단), 화면은 빈 상태.
-- 이슈 "내용"은 Claude 큐레이션 루틴이 별도 INSERT(아래 7절 템플릿) — 이 SQL은 스키마만.
-- ============================================================

-- 1) issue_status enum
do $$ begin
  create type issue_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

-- 2) issues (이슈 = Claude가 큐레이션한 상위 주제 + 자동매칭 규칙 + 서사)
create table if not exists public.issues (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  summary        text,                              -- 한 줄 서사/AI 인사이트
  status         issue_status not null default 'draft',
  match_keywords text[] not null default '{}',      -- 신규 콘텐츠 자동 배정용 패턴
  source         text not null default 'claude',    -- 'claude' | 'admin'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists issues_status_idx on public.issues (status);

drop trigger if exists set_issues_updated_at on public.issues;
create trigger set_issues_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

-- 3) issue_contents (이슈 × 콘텐츠 배정)
create table if not exists public.issue_contents (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issues (id) on delete cascade,
  content_id uuid not null references public.contents (id) on delete cascade,
  source     text not null default 'rule',          -- 'rule'(자동매칭) | 'claude'(큐레이션)
  created_at timestamptz not null default now(),
  unique (issue_id, content_id)
);
create index if not exists issue_contents_issue_idx   on public.issue_contents (issue_id);
create index if not exists issue_contents_content_idx on public.issue_contents (content_id);

-- 4) RLS — 인증 사용자는 published/archived 이슈 조회, admin 전체, 크롤러는 service_role 우회
alter table public.issues         enable row level security;
alter table public.issue_contents enable row level security;

drop policy if exists "issues: 인증 published 조회" on public.issues;
create policy "issues: 인증 published 조회" on public.issues
  for select using (auth.uid() is not null and status in ('published', 'archived'));
drop policy if exists "issues: admin 전체" on public.issues;
create policy "issues: admin 전체" on public.issues
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "issue_contents: 인증 조회" on public.issue_contents;
create policy "issue_contents: 인증 조회" on public.issue_contents
  for select using (auth.uid() is not null);
drop policy if exists "issue_contents: admin 전체" on public.issue_contents;
create policy "issue_contents: admin 전체" on public.issue_contents
  for all using (public.is_admin()) with check (public.is_admin());

-- 5) 검증
select count(*) as issues from public.issues;

-- ============================================================
-- 6) (참고) Claude 큐레이션 루틴이 채우는 형태 — 별도 실행, 이 파일에 포함 X
--    insert into issues (title, summary, status, match_keywords, source) values
--      ('AI 에이전트 보안', '기업용 AI 에이전트의 경쟁력이 ...로 이동', 'published',
--       array['AI 에이전트','에이전트 보안','권한관리','프롬프트 인젝션'], 'claude');
--
-- 7) (이슈 생성 후) 키워드 기반 백필 — 기존 콘텐츠를 이슈에 자동 배정
--    insert into public.issue_contents (issue_id, content_id, source)
--    select i.id, c.id, 'rule'
--    from public.issues i
--    join public.contents c on c.status = 'published' and exists (
--      select 1 from unnest(i.match_keywords) kw
--      where c.title ilike '%'||kw||'%' or coalesce(c.summary_ko,'') ilike '%'||kw||'%'
--    )
--    on conflict (issue_id, content_id) do nothing;
