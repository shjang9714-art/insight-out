-- ─────────────────────────────────────────────────────────────────────────────
-- SQL 핸드오프 (수희) — 434 긴급 즉시 알림
-- 작성: 플래너(Opus) · 2026-07-26
-- 두 부분: (1) ops_issues.alerted_at 컬럼 추가, (2) pg_cron 으로 ops-alert 자주 호출
-- 선행: ops_issues 테이블(429) 적용됨.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) 알림 발송 시각 — 중복 알림 방지(이미 알린 critical 은 재발송 안 함)
alter table public.ops_issues add column if not exists alerted_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) pg_cron: 긴급 알림 엔드포인트를 자주 호출 (C 워커와 동일 패턴, net.http_get)
--     → 새 critical 이슈가 뜨면 즉시 메일. GET + Bearer CRON_SECRET(Vault).
--     ⚠️ 434 코드(/api/cron/ops-alert) 배포 후 등록.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'ops-alert',
  '*/10 * * * *',   -- 10분마다(긴급 탐지·발송). 필요시 '*/5'.
  $$
  select net.http_get(
    url     := 'https://insight-out-app.vercel.app/api/cron/ops-alert',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    timeout_milliseconds := 5000
  );
  $$
);

-- 검증
-- select column_name from information_schema.columns where table_name='ops_issues' and column_name='alerted_at';
-- select jobname, schedule, active from cron.job where jobname='ops-alert';
-- select * from cron.job_run_details where jobid=(select jobid from cron.job where jobname='ops-alert') order by start_time desc limit 5;
