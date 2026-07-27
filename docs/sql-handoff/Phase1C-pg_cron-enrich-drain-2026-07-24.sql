-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1-C SQL 핸드오프 (수희) — Supabase pg_cron 보강 워커 (옵션 B)
-- 작성: 플래너(Opus) · 2026-07-24
-- 목적: pending 보강 큐를 10분마다 드레인 — 기존 Vercel /api/cron/body-backfill 을
--       pg_cron + pg_net 으로 자주 호출. (Vercel Hobby 하루1회 크론 제약 우회)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ■ 선행(활성화 게이팅): 426(drainBackfill 관련도 게이트) 배포 완료됨(0dbf08a, Production 확인).
--   → 지금 켜도 off-topic 유입 없음(관련도 게이트 적용됨). 안전하게 활성화 가능.
--
-- ■ 🔴 GET 사용: body-backfill 라우트는 GET 전용. pg_net 의 net.http_post 가 아니라
--   반드시 **net.http_get** 을 쓴다(헤더로 Bearer 전달). http_post 로 부르면 405.
--
-- ■ 엔드포인트: GET https://insight-out-app.vercel.app/api/cron/body-backfill
--   인증: 헤더 Authorization: Bearer <CRON_SECRET>  (Vercel 환경변수 CRON_SECRET 과 동일 값)
--
-- ■ fire-and-forget: pg_net 은 비동기. 요청을 큐에 넣고 즉시 반환하며, Vercel 함수는
--   서버측에서 끝까지(최대 270s) 실행된다. timeout 은 pg_net 이 응답을 기다리는 시간일 뿐
--   실제 드레인 작업을 제한하지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 확장 활성화
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) CRON_SECRET 을 Vault 에 저장 (한 번만)
--    ⚠️ '실제_CRON_SECRET_값' 을 Vercel 의 CRON_SECRET 과 동일 값으로 교체 후 실행.
--    이미 저장돼 있으면 이 블록은 건너뜀.
select vault.create_secret('실제_CRON_SECRET_값', 'CRON_SECRET');
-- (갱신이 필요하면: select vault.update_secret((select id from vault.secrets where name='CRON_SECRET'), '새값');)

-- 3) 10분마다 enrich 드레인 호출
select cron.schedule(
  'enrich-drain',
  '*/10 * * * *',
  $$
  select net.http_get(
    url     := 'https://insight-out-app.vercel.app/api/cron/body-backfill',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    timeout_milliseconds := 5000
  );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증
-- ─────────────────────────────────────────────────────────────────────────────
-- (a) 잡 등록 확인
--     select jobid, schedule, jobname, active from cron.job where jobname = 'enrich-drain';
--
-- (b) 실행 이력(10분 뒤부터 쌓임)
--     select * from cron.job_run_details
--       where jobid = (select jobid from cron.job where jobname='enrich-drain')
--       order by start_time desc limit 10;
--
-- (c) pg_net 응답(HTTP 200 확인) — 최근 요청
--     select id, status_code, error_msg, created
--       from net._http_response order by created desc limit 10;   -- 200 이어야
--
-- (d) 큐 감소 — 시간당 줄어드는지
--     select count(*) from contents where status='pending' and body_fetched_at is null;
--
-- (e) 효과 — 그간 안 보이던 소스 기사가 published 로 올라오는지(소스 다양성↑)
-- ─────────────────────────────────────────────────────────────────────────────

-- 참고: 간격 조정 / 중지
--   변경: select cron.unschedule('enrich-drain'); 후 원하는 스케줄로 재등록(초기 적체 크면 '*/5 * * * *').
--   중지: select cron.unschedule('enrich-drain');
-- ─────────────────────────────────────────────────────────────────────────────
