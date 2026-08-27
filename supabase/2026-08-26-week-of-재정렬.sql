-- ============================================================================
-- 지시서 20260827c — daily_insights / weekly_flows week_of 재정렬 (기존 데이터 백필)
--
-- 실행: Supabase SQL Editor 에서 사람이 직접, (a) → (b) → (c) → (d) 순서로 실행.
-- 이 파일은 코드/크론에서 자동 실행하지 않는다.
--
-- ⚠️ 일괄 -7일 시프트 금지. 08-24(월) 배치는 하드킬 후 08-26(수)에 수동 재생성돼
--    수집창이 08-19~08-26 두 주에 걸쳐 있다 — 그 배치에 일괄 -7일을 적용하면 틀어진다.
--    대신 행별로 근거 기사(daily_insights.source_articles / weekly_flows.flow[].article)의
--    published_at 중앙값이 속한 KST 주의 월요일을 새 week_of 로 계산한다.
-- ⚠️ DELETE 금지(하드삭제 금지 원칙). UPDATE만 사용.
-- ============================================================================


-- ── (a) 신·구 week_of 매핑 미리보기 — daily_insights ─────────────────────────
-- (c) 실행 전 반드시 이 결과를 눈으로 확인할 것: old_week_of → new_week_of 가 타당한지,
-- median_published_at_utc 가 실제 근거 기사 발행 시점과 맞는지.

select
  di.id,
  di.headline,
  di.week_of as old_week_of,
  di.day_of as old_day_of,
  count(elem.*) as source_article_count,
  percentile_cont(0.5) within group (
    order by (elem->>'published_at')::timestamptz
  ) as median_published_at_utc,
  (
    date_trunc(
      'week',
      (percentile_cont(0.5) within group (order by (elem->>'published_at')::timestamptz))
        at time zone 'Asia/Seoul'
    )
  )::date as new_week_of
from public.daily_insights di
cross join lateral jsonb_array_elements(di.source_articles) as elem
where di.status = 'published'
  and di.source_articles is not null
  and elem->>'published_at' is not null
group by di.id, di.headline, di.week_of, di.day_of
order by di.week_of, di.id;


-- ── (b) 충돌 확인 ─────────────────────────────────────────────────────────────
-- (b-1) daily_insights: 서로 다른 old_week_of 배치가 같은 new_week_of 로 합쳐지는지.
-- daily_insights 의 PK 는 uuid(id) 라 week_of 변경 자체가 실패하진 않지만, 08-24 케이스처럼
-- 두 배치가 뒤섞여 있었다면 여기 결과에 나타난다 — (c) 실행 전 내용이 타당한지 확인할 것.

with mapped as (
  select
    di.id,
    di.week_of as old_week_of,
    (
      date_trunc(
        'week',
        (percentile_cont(0.5) within group (order by (elem->>'published_at')::timestamptz))
          at time zone 'Asia/Seoul'
      )
    )::date as new_week_of
  from public.daily_insights di
  cross join lateral jsonb_array_elements(di.source_articles) as elem
  where di.status = 'published'
    and di.source_articles is not null
    and elem->>'published_at' is not null
  group by di.id, di.week_of
)
select
  new_week_of,
  array_agg(distinct old_week_of order by old_week_of) as old_week_of_batches_merged_in,
  count(*) as row_count
from mapped
group by new_week_of
having count(distinct old_week_of) > 1
order by new_week_of;

-- (b-2) weekly_flows: (week_of, rank) 복합키라 재정렬 후 같은 (new_week_of, rank) 로
-- 두 행이 겹치면 (d) UPDATE 가 unique_violation 으로 실패한다. 여기 결과가 1건이라도 있으면
-- (d) 를 그대로 돌리지 말고 먼저 사람이 판단할 것(예: 정말 같은 주 흐름인지, rank 조정 필요한지).

with wf_mapped as (
  select
    wf.week_of as old_week_of,
    wf.rank,
    (
      date_trunc(
        'week',
        (percentile_cont(0.5) within group (
          order by (elem->'article'->>'published_at')::timestamptz
        )) at time zone 'Asia/Seoul'
      )
    )::date as new_week_of
  from public.weekly_flows wf
  cross join lateral jsonb_array_elements(wf.flow) as elem
  where wf.flow is not null
    and elem->'article'->>'published_at' is not null
  group by wf.week_of, wf.rank
)
select
  new_week_of,
  rank,
  count(*) as collided_rows,
  array_agg(old_week_of order by old_week_of) as old_week_ofs
from wf_mapped
group by new_week_of, rank
having count(*) > 1
order by new_week_of, rank;


-- ── (c) daily_insights.week_of / day_of UPDATE ───────────────────────────────
-- day_of = week_of 규칙 유지(기존 관례, generate.ts와 동일). 헤드라인·3C 등 다른 컬럼은
-- 건드리지 않는다. 근거 기사에 published_at 이 하나도 없는 행(예외 케이스)은 median을
-- 계산할 수 없어 자동 제외되며 기존 week_of/day_of 그대로 남는다.

with mapped as (
  select
    di.id,
    (
      date_trunc(
        'week',
        (percentile_cont(0.5) within group (order by (elem->>'published_at')::timestamptz))
          at time zone 'Asia/Seoul'
      )
    )::date as new_week_of
  from public.daily_insights di
  cross join lateral jsonb_array_elements(di.source_articles) as elem
  where di.status = 'published'
    and di.source_articles is not null
    and elem->>'published_at' is not null
  group by di.id
)
update public.daily_insights di
set week_of = mapped.new_week_of,
    day_of = mapped.new_week_of
from mapped
where mapped.id = di.id
  and mapped.new_week_of is not null
  and mapped.new_week_of is distinct from di.week_of;


-- ── (d) weekly_flows.week_of UPDATE ──────────────────────────────────────────
-- ⚠️ (week_of, rank) 복합키. (b-2) 에서 충돌이 나왔다면 이 UPDATE 를 그대로 돌리지 말 것 —
-- unique_violation 으로 실패하거나(안전한 쪽), 순서에 따라 의도치 않은 행이 덮어써질 수 있다.

with wf_mapped as (
  select
    wf.week_of as old_week_of,
    wf.rank,
    (
      date_trunc(
        'week',
        (percentile_cont(0.5) within group (
          order by (elem->'article'->>'published_at')::timestamptz
        )) at time zone 'Asia/Seoul'
      )
    )::date as new_week_of
  from public.weekly_flows wf
  cross join lateral jsonb_array_elements(wf.flow) as elem
  where wf.flow is not null
    and elem->'article'->>'published_at' is not null
  group by wf.week_of, wf.rank
)
update public.weekly_flows wf
set week_of = wf_mapped.new_week_of
from wf_mapped
where wf_mapped.old_week_of = wf.week_of
  and wf_mapped.rank = wf.rank
  and wf_mapped.new_week_of is not null
  and wf_mapped.new_week_of is distinct from wf.week_of;
