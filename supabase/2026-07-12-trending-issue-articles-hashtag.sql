-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 오늘의 급상승(§3 해시태그 라벨) 지원: trending_issue_articles 뷰에 contents.matched_keywords
-- 추가. content_keywords는 관련도 점수 컬럼이 없는 순수 N:M 조인이라, keyword_groups 결정적
-- 매칭 결과인 matched_keywords(text[], 매칭 순서)의 첫 번째 값을 "대표 해시태그"로 대체 사용한다.
-- 나머지 정의는 2026-07-10(published 필터)과 동일 — 같은 이름 create or replace로 덮어쓴다.

create or replace view public.trending_issue_articles as
select
  ic.issue_id,
  c.id                   as content_id,
  c.title,
  c.collected_at,
  e.canonical_name       as entity_name,
  e.entity_type::text    as entity_type,
  c.matched_keywords
from public.issue_contents ic
join public.contents c on c.id = ic.content_id
join public.issues i   on i.id = ic.issue_id
left join public.content_entities ce on ce.content_id = c.id
left join public.entities e          on e.id = ce.entity_id
where i.status = 'published'
  and c.status = 'published'
  and c.collected_at >= now() - interval '72 hours';

grant select on public.trending_issue_articles to anon, authenticated;

-- ── 확인 쿼리 (matched_keywords 컬럼이 정상 반환되는지 확인) ──
select issue_id, content_id, title, matched_keywords
from public.trending_issue_articles
order by collected_at desc
limit 20;
