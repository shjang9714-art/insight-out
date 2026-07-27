-- job_runs 좀비 행(하드킬로 status='running'에서 멈춘 채 finished_at 없이 남은 행) 일괄 마감.
-- 배경: 2026-07-12 ~ 2026-07-26 사이 cron:body-backfill 2건, cron:signals-backfill 3건,
-- cron:crawl 1건이 running으로 멈춰 있었음(Vercel maxDuration 초과 하드킬 추정 — 자세한 내용은
-- src/lib/jobs/run-job.ts의 reapStaleRunningJobs 주석 참고). 코드에 자동 리퍼를 넣었지만
-- (다음 크론 실행 시 자기 자신을 청소), 이미 쌓인 과거 좀비 행은 코드 배포만으로는 안 지워지므로
-- 수동 1회 정리가 필요함. status는 enum이 아니라 text + CHECK 제약
-- (job_runs_status_check: 'running'|'succeeded'|'failed'|'skipped')이라 'failed'로 마감.
--
-- 실행 전 확인 — 좀비 행 미리보기:
--   select id, job_key, trigger, started_at, now() - started_at as running_for
--   from public.job_runs
--   where status = 'running'
--   order by started_at;
--
-- 정리 실행 (started_at 기준 15분 넘게 running인 행만 대상 — 코드의 리퍼와 동일 기준):
update public.job_runs
set
  status = 'failed',
  finished_at = now(),
  duration_ms = extract(epoch from (now() - started_at)) * 1000,
  error = 'stale run manual cleanup — running 상태로 15분 이상 방치되어 하드킬로 추정, 수동 정리'
where
  status = 'running'
  and started_at < now() - interval '15 minutes';
