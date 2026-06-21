-- ============================================================
-- 엔티티 링킹 백필 + 점등 점검  (2026-06-21)
-- 대상: 수희 (Supabase SQL Editor)
-- 작성: Opus(Cowork) — David 전달
--
-- 배경: SQL 99 백필이 alias 정확매칭(대소문자/공백)으로 0건이었을 가능성.
--       → entities 는 있는데 content_entities 가 비어 지식그래프·엔티티상세·
--          보고서 상위엔티티가 점등 안 됨.
--       앱 수집코드는 이미 lower(alias) 매칭이라 "앞으로의 크롤"은 정상.
--       이 스크립트는 "과거 데이터"를 같은 로직(lower 매칭)으로 재링킹하는 일회성 보정.
--
-- ⭐ 사용법: 아래 STEP 1~4 를 "전체 선택 → Run" 한 번. 멱등(여러 번 돌려도 안전,
--    이미 채워졌으면 no-op). 마지막에 출력되는 "AFTER 점등 카운트" 만 공유해 주세요.
--    STEP 5(그래프 테스트)는 필요 시 따로 실행.
-- ============================================================


-- ── STEP 1. (선택) BEFORE 카운트 — 따로 먼저 돌려보고 싶을 때만 ──────────────
-- (전체 실행 시 STEP 4 의 AFTER 카운트만 보이므로, 비교하려면 이 블록만 먼저 Run)
-- select '1. contents 전체'            as stage, count(*)::text as n from public.contents
-- union all select '2. matched_keywords 있음',  count(*)::text from public.contents where array_length(matched_keywords,1) > 0
-- union all select '3. entities',                count(*)::text from public.entities
-- union all select '4. content_entities',        count(*)::text from public.content_entities
-- order by stage;


-- ── STEP 2. content_entities 백필 (lower 매칭, 멱등) ─────────────────────────
insert into public.content_entities (content_id, entity_id, source)
select distinct c.id, a.entity_id, 'rule'
from public.contents c
cross join lateral unnest(c.matched_keywords) as mk(kw)
join public.entity_aliases a on lower(a.alias) = lower(mk.kw)
on conflict (content_id, entity_id) do nothing;


-- ── STEP 3. mention_count 재계산 ────────────────────────────────────────────
update public.entities e
set mention_count = (
  select count(*) from public.content_entities ce where ce.entity_id = e.id
);


-- ── STEP 4. AFTER 점등 카운트 (이 결과를 공유) ──────────────────────────────
select '1. contents 전체'              as stage, count(*)::text as n from public.contents
union all select '1b. contents 최근7일',      count(*)::text from public.contents where collected_at >= now() - interval '7 days'
union all select '2. matched_keywords 있음',   count(*)::text from public.contents where array_length(matched_keywords,1) > 0
union all select '3. entities',                count(*)::text from public.entities
union all select '3c. entities mention>0',     count(*)::text from public.entities where mention_count > 0
union all select '3d. entities 경쟁사',         count(*)::text from public.entities where is_competitor
union all select '4. content_entities',        count(*)::text from public.content_entities
union all select '5. issues(published)',       count(*)::text from public.issues where status = 'published'
union all select '5b. issue_contents',         count(*)::text from public.issue_contents
union all select '6. insight_cards(published)',count(*)::text from public.insight_cards where status = 'published'
union all select '7. sentiment 있음',           count(*)::text from public.contents where sentiment is not null
order by stage;


-- ── STEP 5. (따로 실행) 그래프 이웃 스모크 테스트 — 117 entity_neighbors ─────
-- 행이 반환되면 116/117 지식그래프 점등 확정.
-- select * from public.entity_neighbors(
--   (select id from public.entities order by mention_count desc limit 1), 20, 1
-- );
