-- ⚠️ 제안 — 아직 미적용. 실행하지 말고 검토 후 판단할 것.
-- 2026-08-31c 실행 후에 실행. anon PostgREST 조회 권한(기존 뷰와 동일 정책).

grant select on public.trending_keywords_mv to anon, authenticated;
grant select on public.trending_keywords to anon, authenticated;
