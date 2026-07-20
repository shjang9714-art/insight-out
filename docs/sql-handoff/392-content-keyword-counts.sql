-- ============================================================
-- 핸드오프 392 — content_keyword_counts RPC (콘텐츠 인기 키워드 집계)
-- 수희 실행: Supabase SQL Editor. 그대로 실행(한 번에 OK). 읽기 전용·authed.
--
-- 배경(2026-07-20 프로덕션 실측):
--   /api/contents/keywords 가 응답 382바이트에 1.56초를 쓴다.
--   현재 라우트는 칩 12개를 뽑으려고 최근 30일 published 콘텐츠의
--   matched_keywords 를 1,000건씩 페이지네이션해 **전부 앱으로 가져와**
--   Node 메모리에서 Map 집계한다(while(true) 루프). 네트워크 왕복 + 전송량이
--   전부 낭비다. 집계를 DB 로 내리면 12행만 오간다.
--
-- 인덱스: 237 로 contents_category_collected_idx (category, collected_at desc) 와
--   contents_collected_at_idx 가 이미 있어 아래 where 절이 인덱스를 탄다.
--   matched_keywords GIN(57)은 unnest 집계에는 쓰이지 않는다 — 정상.
-- 새 인덱스는 만들지 않는다.
-- ============================================================

-- ── ① 인기 키워드 집계 RPC ─────────────────────────────────
-- p_categories: DB enum 값 배열(예: ARRAY['뉴스']). NULL 이면 전체 카테고리.
--   ※ 앱의 toDbCategories() 결과를 그대로 넘긴다(리서치 → 리포트/가트너/KRG 등).
create or replace function public.content_keyword_counts(
  p_categories text[] default null,
  p_days       integer default 30,
  p_limit      integer default 12
)
returns table (name text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    btrim(k.keyword) as name,
    count(*)         as count
  from public.contents c
  cross join lateral unnest(c.matched_keywords) as k(keyword)
  where c.status = 'published'
    and c.collected_at >= now() - (least(greatest(p_days, 1), 90) || ' days')::interval
    and (
      p_categories is null
      or cardinality(p_categories) = 0
      or c.category = any (p_categories::content_category[])
    )
    and btrim(k.keyword) <> ''
  group by btrim(k.keyword)
  order by count(*) desc, btrim(k.keyword)
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function public.content_keyword_counts(text[], integer, integer) from public;
grant execute on function public.content_keyword_counts(text[], integer, integer) to authenticated;


-- ── ② 검증 (실행 후 아래를 돌려 결과를 알려주세요) ──────────
-- (a) 동작 확인 — 12행이 나오면 정상
select * from public.content_keyword_counts(ARRAY['뉴스'], 30, 12);

-- (b) 속도 확인 — Execution Time 을 알려주세요 (목표: 200ms 이하)
explain analyze
select * from public.content_keyword_counts(ARRAY['뉴스'], 30, 12);

-- (c) 전체 카테고리(파라미터 NULL) 도 도는지
select count(*) from public.content_keyword_counts(null, 30, 12);


-- ── ③ 별건 조사 (393 판단 근거 — 결과 숫자만 알려주세요) ────
-- 콘텐츠 목록 카드의 요약문은 summary_ko 를 쓰고, 없으면 body_original 앞부분을
-- 잘라 쓴다. body_original 을 목록 쿼리에서 빼도 되는지 판단하려면 결측률이 필요하다.
select
  count(*)                                                        as published_news,
  count(*) filter (where summary_ko is null or btrim(summary_ko) = '') as summary_missing,
  round(
    100.0 * count(*) filter (where summary_ko is null or btrim(summary_ko) = '')
    / nullif(count(*), 0)
  , 1)                                                            as missing_pct
from public.contents
where status = 'published' and category = '뉴스';


-- ============================================================
-- 롤백 (필요 시)
-- drop function if exists public.content_keyword_counts(text[], integer, integer);
-- ============================================================
