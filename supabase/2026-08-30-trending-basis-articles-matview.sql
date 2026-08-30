-- ⚠️ 기록용 — 실행하지 말 것. 운영 DB엔 이미 적용됨(2026-08-30).
-- trending_basis_articles(2026-08-27c) 뷰가 이슈/엔티티 배열 집계를 매 행마다 상관
-- 서브쿼리(correlated subquery)로 계산해 실측 2,511ms가 걸렸다. 아래 순서대로
-- materialized view + concurrently refresh로 교체해 7.845ms로 단축(행수 2,318 동일,
-- 데이터 정합성 변화 없음 — 15분 주기 refresh 지연만 새로 생김).
--
-- 튜닝 경로(실측): 2,511ms(상관 서브쿼리) → 1,691ms(CTE로 전환) →
--   1,080ms(CTE에 `as materialized` 강제) → 7.845ms(materialized view + index)
-- unique index(content_id)는 `refresh ... concurrently`의 필수 조건(없으면 refresh 중
-- 뷰가 잠겨 조회가 막힌다 — 15분마다 그게 반복되면 서비스 영향이 크다).
--
-- 실행 순서: ① matview 생성 ② index 2종 ③ 얇은 view로 감싸기(호출부 무변경) ④ grant
--   ⑤ pg_cron 15분 refresh

-- ① CTE 3개(base/ic_base/ce_base)를 `as materialized`로 강제 — 옵티마이저가 이걸 다시
--   상관 서브쿼리처럼 inline하지 못하게 막아, 각각 딱 한 번씩만 스캔·조인되게 한다.
create materialized view public.trending_basis_articles_mv as
with base as materialized (
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
    coalesce(s.trust_tier, 1) as source_trust_tier
  from public.contents c
  left join public.sources s on s.id = c.source_id
  where c.status = 'published'
    and c.collected_at >= now() - interval '72 hours'
),
ic_base as materialized (
  -- 원본 뷰의 `exists(...)` 필터(발행 이슈에 매칭된 기사만)도 이 join으로 흡수된다
  -- (ic_base에 행이 없는 content_id는 최종 join에서 자연히 빠짐).
  select ic.content_id, array_agg(distinct ic.issue_id) as iss
  from public.issue_contents ic
  join public.issues i on i.id = ic.issue_id
  where i.status = 'published'
    and ic.content_id in (select content_id from base)
  group by ic.content_id
),
ce_base as materialized (
  select ce.content_id, array_agg(distinct e.canonical_name) as ent
  from public.content_entities ce
  join public.entities e on e.id = ce.entity_id
  where e.entity_type::text in ('company', 'product', 'person')
    and e.canonical_name is not null
    and ce.content_id in (select content_id from base)
  group by ce.content_id
)
select
  base.content_id,
  base.title,
  base.collected_at,
  base.matched_keywords,
  base.cluster_id,
  base.source_key,
  base.source_trust_tier,
  ic_base.iss  as issue_ids,
  ce_base.ent  as entity_names
from base
join ic_base on ic_base.content_id = base.content_id
left join ce_base on ce_base.content_id = base.content_id;

-- ② unique index(content_id) — `refresh ... concurrently` 필수 조건.
--   collected_at desc index — computeTrendingEvents()의 `.order('collected_at', {ascending:false})` 지원.
create unique index trending_basis_articles_mv_content_id_idx
  on public.trending_basis_articles_mv (content_id);
create index trending_basis_articles_mv_collected_at_idx
  on public.trending_basis_articles_mv (collected_at desc);

-- ③ 기존 뷰 이름을 그대로 유지 — 호출부(trending.ts)는 matview 존재를 몰라도 된다.
create or replace view public.trending_basis_articles as
select * from public.trending_basis_articles_mv;

-- ④ anon PostgREST 조회 권한(원본 뷰와 동일 정책 — matview도 함께 부여해야 향후 직접
--   조회하는 경로가 생겨도 막히지 않는다).
grant select on public.trending_basis_articles_mv to anon, authenticated;
grant select on public.trending_basis_articles to anon, authenticated;

-- ⑤ 15분마다 concurrently refresh — 크론 소스가 죽으면 급상승 데이터가 "에러 없이 조용히"
--   멈춘다(§6 후속 문서 참고). 갱신 시각(pg_matviews 등)을 별도로 모니터링해야 한다.
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-trending-basis-articles',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.trending_basis_articles_mv$$
);
