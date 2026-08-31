-- ⚠️ 제안 — 아직 미적용. 실행하지 말고 검토 후 판단할 것.
-- 배경(확정사실 5·6, 2026-08-31): trending_keywords 조회가 1.6~2.7초로 변동이 심하고
-- anon statement_timeout(3초)에 가깝다. explain 확인 결과 인덱스 문제가 아니라 조인
-- 폭발 — 144h 기사 2,323건 × issue_contents ≈ 43,514행을 매 요청 집계하고 있고,
-- collected_at 조건인데도 contents_category_collected_idx(category, collected_at)를
-- 타서 비효율. 이 3초 경계를 오가는 변동성이 "가끔 실패 → 그 실패가 unstable_cache에
-- 박혀 화면이 계속 폴백"의 근본 원인으로 추정된다.
--
-- 해결: trending_basis_articles(2026-08-30 matview 전환, 2,511ms→7.845ms)와 동일한
-- 패턴 — 매 요청 라이브 조인 대신 materialized view + pg_cron 15분 refresh concurrently로
-- 전환해 조회 비용을 사실상 0에 수렴시킨다. 정의는 2026-08-30b(144h 창 추가) 버전과 동일.

create materialized view public.trending_keywords_mv as
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
  and c.collected_at >= now() - interval '144 hours'
group by i.id, i.title
having count(c.id) filter (where c.collected_at >= now() - interval '72 hours') >= 2
order by recent_count desc;
