-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 버그 수정: trending_keywords / trending_issue_articles 뷰가 이슈 status('published')만
-- 필터하고 콘텐츠 status는 걸지 않아, 발행 이슈에 매칭된 '검토대기(pending)'·'반려(rejected)'
-- 콘텐츠까지 급상승 건수에 잡히던 문제. contents.status = 'published' 조건을 추가한다.
-- (ContentStatus = 'pending' | 'published' | 'rejected')
-- 나머지 정의는 2026-07-08c(72h 창)와 동일 — 같은 이름 create or replace로 덮어쓴다.

create or replace view public.trending_keywords as
select
  i.id    as issue_id,
  i.title,
  count(c.id) filter (
    where c.collected_at >= now() - interval '72 hours'
  )       as recent_count,
  count(c.id) filter (
    where c.collected_at >= now() - interval '144 hours'
      and c.collected_at <  now() - interval '72 hours'
  )       as prev_count
from public.issues i
join public.issue_contents ic on ic.issue_id = i.id
join public.contents c        on c.id = ic.content_id
where i.status = 'published'
  and c.status = 'published'          -- ← 추가: 검토대기·반려 콘텐츠 제외
group by i.id, i.title
having count(c.id) filter (where c.collected_at >= now() - interval '72 hours') >= 2
order by recent_count desc;

grant select on public.trending_keywords to anon, authenticated;

create or replace view public.trending_issue_articles as
select
  ic.issue_id,
  c.id                   as content_id,
  c.title,
  c.collected_at,
  e.canonical_name       as entity_name,
  e.entity_type::text    as entity_type
from public.issue_contents ic
join public.contents c on c.id = ic.content_id
join public.issues i   on i.id = ic.issue_id
left join public.content_entities ce on ce.content_id = c.id
left join public.entities e          on e.id = ce.entity_id
where i.status = 'published'
  and c.status = 'published'          -- ← 추가: 검토대기·반려 콘텐츠 제외
  and c.collected_at >= now() - interval '72 hours';

grant select on public.trending_issue_articles to anon, authenticated;

-- ── 확인 쿼리 (수정 후 상위 순위가 발행 콘텐츠만으로 재집계되는지 확인) ──
select issue_id, title, recent_count, prev_count
from public.trending_keywords
order by recent_count desc
limit 15;
