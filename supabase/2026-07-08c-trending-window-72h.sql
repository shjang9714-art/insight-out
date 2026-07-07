-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 급상승 창 확대 48h→72h(크롤 3주기 포착, 후보 풀 확대). 기존 두 뷰를 같은 이름으로
-- create or replace — GRANT는 뷰 재정의로 사라지지 않지만 최초 적용 안 됐을 케이스 대비 재선언.
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
  and c.collected_at >= now() - interval '72 hours';

grant select on public.trending_issue_articles to anon, authenticated;

-- ── 확인 쿼리 ──────────────────────────────────────────────────────────────
select issue_id, title, recent_count, prev_count from public.trending_keywords order by recent_count desc limit 15;
