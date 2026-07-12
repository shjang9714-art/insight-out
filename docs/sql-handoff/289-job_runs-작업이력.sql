-- 289 작업 이력(job_runs) — 크론·일괄작업 실행 기록 + 실패 가시성
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에). 멱등.
-- 전제: users 테이블(started_by FK).
-- 적용 후 점등: 어드민 "작업 이력" 화면 + 운영 대시보드 "최근 실패한 작업" 카드.
--
-- 배경(설계: docs/설계-작업이력-실패가시성.md):
--   크론 10개(crawl·briefing·newsletter·body-backfill·signals-backfill·ai-refresh·
--   link-health·key-insights·daily-insights·competitor-weekly)와 어드민 일괄작업 13개가
--   **실행 기록을 전혀 남기지 않는다**. crawl_logs 는 크롤 전용이고,
--   llm_usage/translation_usage 는 사용량(비용)이지 실행 이력이 아니다.
--   특히 크론은 아무도 보고 있지 않아, 새벽에 조용히 실패해도 Vercel 로그를 뒤져야만 안다.
--
-- 테이블명이 ai_jobs 가 아닌 이유:
--   이 잡들의 절반은 AI가 아니다(본문 수집·URL 정규화·썸네일·클러스터링·링크 헬스).
--   지시서 287이 화면 명칭을 '일괄 작업 관리'로 바로잡은 것과 같은 이유로 job_runs 로 둔다.

begin;

create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),

  -- 'cron:competitor-weekly', 'admin:thumbnail-backfill' 같은 식별자
  job_key     text not null,
  trigger     text not null
                check (trigger in ('cron','admin')),
  mode        text,                                   -- 'fresh'|'retry' 등(없으면 null)
  started_by  uuid references public.users (id) on delete set null,  -- admin 실행자(cron이면 null)

  -- running: 시작만 기록됨(끝나기 전 죽으면 이 상태로 남음 → 그것도 신호다)
  -- skipped: 안 돌 이유가 있어 안 돎(예: 284 크론의 not_scheduled) — 실패가 아니다
  status      text not null default 'running'
                check (status in ('running','succeeded','failed','skipped')),

  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,

  -- 백필류 공통 카운트(없는 잡은 null)
  processed   integer,
  filled      integer,
  skipped_count integer,                              -- 'skipped' 는 status 값과 헷갈리므로 컬럼명 분리
  remaining   integer,

  error       text,
  meta        jsonb not null default '{}'             -- 잡별 원본 결과 전체
);

-- 잡별 최근 실행 조회
create index if not exists job_runs_key_started_idx
  on public.job_runs (job_key, started_at desc);

-- 전체 최근 실행
create index if not exists job_runs_started_idx
  on public.job_runs (started_at desc);

-- 실패만 빠르게(대시보드 "최근 실패한 작업" 카드)
create index if not exists job_runs_failed_idx
  on public.job_runs (started_at desc)
  where status = 'failed';

-- 서버(service_role)만 읽고 쓴다 → RLS 켜고 정책 없음(service_role 은 RLS 우회).
alter table public.job_runs enable row level security;

commit;

-- ── 보존 정리(선택, 나중에 크론/유지보수 버튼으로) ───────────────────────────
-- job_runs 는 계속 쌓인다. 90일 초과분 정리:
--   delete from public.job_runs where started_at < now() - interval '90 days';

-- ── 확인용 ───────────────────────────────────────────────────────────────────
--   select job_key, status, started_at, duration_ms, processed, filled, error
--     from public.job_runs order by started_at desc limit 20;
--
-- 최근 24시간 실패:
--   select job_key, error, started_at from public.job_runs
--    where status = 'failed' and started_at > now() - interval '24 hours'
--    order by started_at desc;
--
-- 잡별 마지막 성공(안 돈 크론 찾기):
--   select job_key, max(started_at) filter (where status = 'succeeded') as last_ok
--     from public.job_runs group by job_key order by last_ok nulls first;
