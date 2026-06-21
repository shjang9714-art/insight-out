-- ============================================================
-- 파이프라인 점검 — 어느 단계에서 데이터가 끊겼는지 한 번에 확인
-- 수희/David: Supabase SQL Editor 에서 ① 실행 후 결과를 Opus 에게 공유.
-- ============================================================

-- ① 단계별 카운트
select '1. contents 전체'              as stage, count(*)::text as n from public.contents
union all select '1b. contents 최근7일',  count(*)::text from public.contents where collected_at >= now() - interval '7 days'
union all select '2. matched_keywords 있음', count(*)::text from public.contents where array_length(matched_keywords,1) > 0
union all select '3. entities',             count(*)::text from public.entities
union all select '3b. entity_aliases',      count(*)::text from public.entity_aliases
union all select '3c. entities mention>0',  count(*)::text from public.entities where mention_count > 0
union all select '3d. entities 경쟁사',     count(*)::text from public.entities where is_competitor
union all select '4. content_entities',     count(*)::text from public.content_entities
union all select '5. issues(published)',    count(*)::text from public.issues where status = 'published'
union all select '5b. issue_contents',      count(*)::text from public.issue_contents
union all select '6. insight_cards(published)', count(*)::text from public.insight_cards where status = 'published'
union all select '7. contents.sentiment 있음', count(*)::text from public.contents where sentiment is not null
order by stage;

-- ② (참고) content_signals 는 65 미적용이면 아래가 에러 — 그러면 65 미적용으로 판단
-- select '8. content_signals' as stage, count(*) from public.content_signals;

-- ============================================================
-- ③ 보정 백필 — ①에서 "3. entities > 0 인데 4. content_entities = 0" 이면 실행
--    원인: 99 백필이 alias 정확매칭(대소문자/공백)으로 0건이었을 가능성.
--    아래는 대소문자 무시 + 배열 unnest 로 견고하게 재적재.
-- ============================================================
-- insert into public.content_entities (content_id, entity_id, source)
-- select distinct c.id, a.entity_id, 'rule'
-- from public.contents c
-- cross join lateral unnest(c.matched_keywords) as mk(kw)
-- join public.entity_aliases a on lower(a.alias) = lower(mk.kw)
-- on conflict (content_id, entity_id) do nothing;
--
-- -- mention_count 재계산
-- update public.entities e
-- set mention_count = (select count(*) from public.content_entities ce where ce.entity_id = e.id);

-- ============================================================
-- ④ (117 적용 후) 그래프 이웃 동작 테스트
-- select * from public.entity_neighbors(
--   (select id from public.entities order by mention_count desc limit 1), 20, 1);
