-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- §5 보강(서브이벤트 클러스터링) 지원 뷰: trending_keywords가 준 후보 이슈들의
-- 최근 48h 기사 + 엔티티를 (issue_id, content_id, entity) 그레인으로 노출.
-- 앱 코드(src/lib/issues/trending.ts)가 이 뷰를 issue_id별로 그룹핑해
-- 제목 유사도·핵심 엔티티(company/product/person) 공유 기준으로 서브클러스터링한다.
-- contents/content_entities/issues는 "인증 사용자만 조회" RLS라 익명 캐시 계산이 불가하므로,
-- trending_keywords와 동일하게 뷰 + GRANT로 우회(기존 issue_evidence 뷰와 동일 패턴).
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
  and c.collected_at >= now() - interval '48 hours';

-- ★ GRANT 필수 (2026-05-30 이후 Data API 기본 비노출)
grant select on public.trending_issue_articles to anon, authenticated;

-- ── 확인 쿼리 (실행 후 특정 이슈 하나의 기사·엔티티 행이 반환되는지 확인) ──
select issue_id, content_id, title, collected_at, entity_name, entity_type
from public.trending_issue_articles
order by collected_at desc
limit 20;
