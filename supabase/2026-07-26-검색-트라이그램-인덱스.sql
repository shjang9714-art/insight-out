-- ============================================================
-- Insight Out — 통합 검색 ILIKE 성능용 트라이그램(pg_trgm) 인덱스
-- 배경: 상단 검색이 카테고리 계위별(뉴스/유튜브/웹인사이트/리포트/핵심인사이트/
--       이슈/기업동향/키워드)로 나눠 병렬 ILIKE 조회를 하도록 바뀌면서
--       (지시서: fix/search-dropdown-coverage) 동시 쿼리 수가 늘었다.
--       인덱스 없이도 동작은 하지만(기존에도 인덱스 없이 운영), 트래픽이
--       늘면 순차 스캔 비용이 커지므로 선제적으로 제공.
-- 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행
-- 안전: 전부 IF NOT EXISTS / CREATE INDEX CONCURRENTLY 미사용(트랜잭션 내 실행
--       가능하게) — 필요시 운영 부하를 보고 CONCURRENTLY 로 바꿔 재실행해도 됨
-- GRANT: 인덱스는 조회 권한 객체가 아니므로 별도 GRANT 불필요(테이블 자체
--        SELECT 권한은 이미 부여돼 있음 — schema.sql 의 기존 GRANT 로 충분)
-- ============================================================

create extension if not exists pg_trgm;

-- contents: title / summary_ko / body_original ILIKE 대상
create index if not exists contents_title_trgm_idx
  on public.contents using gin (title gin_trgm_ops);

create index if not exists contents_summary_ko_trgm_idx
  on public.contents using gin (summary_ko gin_trgm_ops);

create index if not exists contents_body_original_trgm_idx
  on public.contents using gin (body_original gin_trgm_ops);

-- daily_insights: headline / summary_ko / market_trend / competitor_trend / implication
create index if not exists daily_insights_headline_trgm_idx
  on public.daily_insights using gin (headline gin_trgm_ops);

create index if not exists daily_insights_summary_ko_trgm_idx
  on public.daily_insights using gin (summary_ko gin_trgm_ops);

-- issues: title / summary
create index if not exists issues_title_trgm_idx
  on public.issues using gin (title gin_trgm_ops);

create index if not exists issues_summary_trgm_idx
  on public.issues using gin (summary gin_trgm_ops);

-- entities: canonical_name / description
create index if not exists entities_canonical_name_trgm_idx
  on public.entities using gin (canonical_name gin_trgm_ops);

create index if not exists entities_description_trgm_idx
  on public.entities using gin (description gin_trgm_ops);

-- keywords: name
create index if not exists keywords_name_trgm_idx
  on public.keywords using gin (name gin_trgm_ops);
