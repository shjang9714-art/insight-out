-- ⚠️ 기록용 — 실행하지 말 것. 운영 DB엔 이미 적용됨(2026-08-30).
-- 2026-07-10-trending-published-content-filter.sql의 trending_keywords 정의에서
-- where 절에 `and c.collected_at >= now() - interval '144 hours'` 한 줄만 추가.
--
-- 144h보다 오래된 행은 두 count filter(recent_count·prev_count) 모두 0이고
-- having recent_count >= 2에서 어차피 탈락하므로 결과는 완전히 동일하다. 조인 대상만
-- 줄여 실측 111.752ms로 단축(기존엔 join(issue_contents/contents)에 시간 조건이 전혀
-- 없어 72h·144h 밖의 모든 과거 행까지 조인·집계 대상에 들어가고 있었다).
-- 실측: 111.752ms / 124건(수정 전후 건수 동일).

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
  and c.status = 'published'
  and c.collected_at >= now() - interval '144 hours'  -- ← 추가: join 대상 축소(결과 동일)
group by i.id, i.title
having count(c.id) filter (where c.collected_at >= now() - interval '72 hours') >= 2
order by recent_count desc;

grant select on public.trending_keywords to anon, authenticated;
