-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 지시서 548 선행 SQL (최종) — 급상승 데이터 잘림 해소 + 매체 다양성 신호 공급
--
-- 🔴 실측(2026-08-27): trending_issue_articles를 후보 이슈로 필터하면 158,384행이 나온다.
--    코드는 ISSUE_ARTICLES_MAX_PAGES(10) × 1000 = 10,000행에서 자른다(trending.ts:562).
--    → 실제 데이터의 6%, collected_at desc 정렬이라 사실상 최근 4~5시간치만 보고
--      "오늘의 급상승"을 계산해 왔다. 하루치 사건 클러스터가 만들어질 수 없었다.
--
-- 행 폭발 원인 2가지:
--   ① 이슈 멤버십 fan-out — 기사 1건이 여러 이슈에 태깅됨(상위 이슈 하나가 72h 전체
--      기사 2,383건 중 1,408건을 물고 있다 = 59%)
--   ② 엔티티 fan-out — content_entities left join으로 엔티티 수만큼 행 복제
--   158,384 / 2,383 ≈ 기사당 66행.
--
-- 해결: 기사 1건 = 1행으로 접는다. issue_ids·entity_names를 배열로 집계해 두 fan-out을
--   모두 제거 → 약 2,383행(66배 감소)으로 캡에 걸리지 않는다.
--
-- 덤으로 급상승 랭킹에 필요한 신호를 같은 뷰에서 함께 공급한다:
--   - source_key  : 매체 다양성 계산용(몇 개 언론사가 다뤘나). source_id가 없는
--                   검색 수집 기사는 original_url 호스트로 대체(실측 매체미상 0건).
--   - cluster_id  : 크롤러가 수집 시점에 이미 판정한 "같은 기사" 묶음(crawler/cluster.ts —
--                   대표는 cluster_id=null, 멤버는 대표 id). 재계산하지 말고 이걸 쓴다.
--   - source_trust_tier : 현재 404개 매체 전부 1이라 사실상 무효. 나중에 등급을 채우면
--                   자동으로 살아나도록 컬럼만 미리 내보낸다.
--
-- 기존 trending_keywords / trending_issue_articles 뷰는 건드리지 않는다
--   (trending_keywords는 burst 계산에 계속 쓰고, trending_issue_articles는 롤백 대비 보존).

create or replace view public.trending_basis_articles as
select
  c.id                      as content_id,
  c.title,
  c.collected_at,
  c.matched_keywords,
  c.cluster_id,
  coalesce(
    c.source_id::text,
    nullif(lower(substring(c.original_url from '^https?://(?:www\.)?([^/:?#]+)')), '')
  )                         as source_key,
  coalesce(s.trust_tier, 1) as source_trust_tier,
  (
    select array_agg(distinct ic.issue_id)
    from public.issue_contents ic
    join public.issues i on i.id = ic.issue_id
    where ic.content_id = c.id
      and i.status = 'published'
  )                         as issue_ids,
  (
    select array_agg(distinct e.canonical_name)
    from public.content_entities ce
    join public.entities e on e.id = ce.entity_id
    where ce.content_id = c.id
      and e.entity_type::text in ('company', 'product', 'person')
      and e.canonical_name is not null
  )                         as entity_names
from public.contents c
left join public.sources s on s.id = c.source_id
where c.status = 'published'
  and c.collected_at >= now() - interval '72 hours'
  and exists (
    select 1
    from public.issue_contents ic
    join public.issues i on i.id = ic.issue_id
    where ic.content_id = c.id
      and i.status = 'published'
  );

grant select on public.trending_basis_articles to anon, authenticated;
