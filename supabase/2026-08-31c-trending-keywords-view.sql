-- ⚠️ 제안 — 아직 미적용. 실행하지 말고 검토 후 판단할 것.
-- 2026-08-31b 실행 후에 실행. 기존 뷰 이름을 그대로 유지 — 호출부(trending.ts)는
-- matview 존재를 몰라도 된다(trending_basis_articles와 동일 패턴).

create or replace view public.trending_keywords as
select * from public.trending_keywords_mv;
