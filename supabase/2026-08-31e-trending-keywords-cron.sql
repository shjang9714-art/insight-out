-- ⚠️ 제안 — 아직 미적용. 실행하지 말고 검토 후 판단할 것.
-- 2026-08-31d 실행 후에 실행. 15분마다 concurrently refresh — trending_basis_articles_mv와
-- 동일 주기. 🔴 이 크론이 죽으면 trending_keywords가 조용히 갱신을 멈춘다(에러 없이 오래된
-- 값을 계속 반환) — trending_basis_articles_mv 갱신 시각과 함께 모니터링해야 한다.
-- pg_cron extension은 2026-08-30 matview 작업에서 이미 생성됨(create extension if not
-- exists이므로 재실행해도 안전).

select cron.schedule(
  'refresh-trending-keywords',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.trending_keywords_mv$$
);
