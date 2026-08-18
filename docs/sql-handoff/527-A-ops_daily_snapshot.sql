-- 527-A 운영 일일 스냅샷 테이블
-- 적용: David 직접 (Supabase SQL Editor). 전체 붙여넣고 RUN. 멱등.
--
-- 배경:
--   재고 지표(검토대기 건수 등)에 기준선이 없다 — 매일 현재값만 조회하고 버린다.
--   역산(오늘 재고 − 유입 + 만료)은 발행 전환 등 다른 유출 경로로 오차가 쌓인다.
--   ops-brief 크론이 매일 그날의 재고(스톡)·흐름(플로우) 스냅샷을 upsert 로 적재한다.

begin;

create table if not exists public.ops_daily_snapshot (
  snapshot_date         date primary key,
  pending_total         integer not null default 0,
  pending_by_reason     jsonb   not null default '{}'::jsonb,
  body_backlog          integer not null default 0,
  users_pending         integer not null default 0,
  published_total       integer not null default 0,
  rejected_total        integer not null default 0,
  collected_day         integer not null default 0,
  published_day         integer not null default 0,
  pending_in_day        integer not null default 0,
  pending_expired_day   integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.ops_daily_snapshot is
  '527-A: 운영 일일 스냅샷(재고+흐름). ops-brief 크론이 매일 1회 upsert. snapshot_date 로 재실행 시 덮어씀.';
comment on column public.ops_daily_snapshot.pending_total is
  '스톡 — status=pending and deleted_at is null 현재 건수(스냅샷 실행 시점).';
comment on column public.ops_daily_snapshot.pending_by_reason is
  '스톡 — pending_total 을 review_reason 별로 집계. null 사유는 "_null" 키.';
comment on column public.ops_daily_snapshot.body_backlog is
  '스톡 — status=pending and body_fetched_at is null and deleted_at is null.';
comment on column public.ops_daily_snapshot.users_pending is
  '스톡 — users.approval_status=pending 승인 대기 사용자 수.';
comment on column public.ops_daily_snapshot.published_total is '스톡 — status=published 전체 건수.';
comment on column public.ops_daily_snapshot.rejected_total  is '스톡 — status=rejected 전체 건수.';
comment on column public.ops_daily_snapshot.collected_day is
  '플로우 — 대상일(KST)에 collected_at 이 속한 건수(그날 유입).';
comment on column public.ops_daily_snapshot.published_day is
  '플로우 — 대상일(KST)에 published_at 이 속한 건수(그날 발행 전환).';
comment on column public.ops_daily_snapshot.pending_in_day is
  '근사치 — 대상일 수집분 중 스냅샷 실행 시점 기준 여전히 pending 인 건수. 나중에 발행·만료되면 과거 스냅샷 값은 갱신되지 않고 그대로 남는다.';
comment on column public.ops_daily_snapshot.pending_expired_day is
  '플로우 — 대상일 job_runs 의 cron:pending-expire 행 meta.total 합(그날 만료 처리 건수).';

create trigger set_updated_at
  before update on public.ops_daily_snapshot
  for each row execute function public.set_updated_at();

alter table public.ops_daily_snapshot enable row level security;

-- 조회는 관리자만. insert/update 정책은 두지 않는다 → service_role 로만 적재된다.
drop policy if exists "ops_daily_snapshot: admin 조회" on public.ops_daily_snapshot;
create policy "ops_daily_snapshot: admin 조회" on public.ops_daily_snapshot
  for select using (public.is_admin());

commit;

-- ────────────────────────────────────────────────────────────────────────────
-- 적용 확인:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='ops_daily_snapshot' order by ordinal_position;
--
-- set_updated_at() 트리거 함수가 이미 있는지 확인(없으면 아래 정의 후 재실행):
--   select proname from pg_proc where proname = 'set_updated_at';
-- ────────────────────────────────────────────────────────────────────────────
