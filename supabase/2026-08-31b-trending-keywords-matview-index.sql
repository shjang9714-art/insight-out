-- ⚠️ 제안 — 아직 미적용. 실행하지 말고 검토 후 판단할 것.
-- 2026-08-31a 실행 후에 실행. unique index(issue_id) — `refresh materialized view
-- concurrently`의 필수 조건(없으면 refresh 중 뷰가 잠겨 조회가 막힌다).

create unique index trending_keywords_mv_issue_id_idx
  on public.trending_keywords_mv (issue_id);
