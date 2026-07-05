-- 195: 자동 제외 후보(도메인 단위). 최근 저품질(검토대기/반려) 반복 도메인을 집계해 제외 규칙 후보로 제안.
-- 학습 루프: 194 hit_count(규칙 효과) + 186 불량률의 도메인 버전. "무시" 학습으로 좋은 도메인 재제안 방지.
-- 크롤 단계 즉시 reject 항목은 contents 에 미저장 → 여기 집계는 pending/rejected 로 "들어온 뒤 걸러진" junk 대상(이미 차단된 최악은 제외, 무방).
-- 멱등. 미적용 시 195 코드는 graceful(후보 [] → 패널 "집계 준비 전").

-- STEP 1. 무시 목록(학습) — 후보에서 영구 제외할 도메인
create table if not exists exclusion_candidate_ignores (
  domain      text primary key,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- STEP 2. 후보 집계 RPC
--   p_days: 집계 기간(기본 30) · p_min_count: 최소 junk 건수(기본 3)
--   host = original_url 호스트에서 앞의 'www.' 제거(www/bare 병합, endsWith 매칭 커버리지↑)
--   junk = status in ('pending','rejected')  (published 는 정상)
--   제외: 빈 host · news.google.com(집계기 — 196 canonical 대상) · 이미 활성 도메인 규칙 있음 · 무시 목록
create or replace function exclusion_candidates(
  p_days      integer default 30,
  p_min_count integer default 3
)
returns table (
  domain         text,
  total          bigint,
  junk_count     bigint,
  pending        bigint,
  rejected       bigint,
  junk_ratio     numeric,
  last_collected timestamptz,
  sample_title   text
)
language sql
stable
as $$
  with rows as (
    select
      regexp_replace(
        lower(split_part(split_part(original_url, '://', 2), '/', 1)),
        '^www\.', ''
      ) as host,
      status, collected_at, title
    from contents
    where original_url is not null
      and collected_at >= now() - make_interval(days => p_days)
  ),
  agg as (
    select
      host,
      count(*)                                                          as total,
      count(*) filter (where status in ('pending','rejected'))          as junk_count,
      count(*) filter (where status = 'pending')                        as pending,
      count(*) filter (where status = 'rejected')                       as rejected,
      max(collected_at)                                                 as last_collected,
      (array_agg(title order by collected_at desc)
         filter (where status in ('pending','rejected')))[1]            as sample_title
    from rows
    where host <> '' and host <> 'news.google.com'
    group by host
  )
  select
    a.host as domain,
    a.total, a.junk_count, a.pending, a.rejected,
    round(a.junk_count::numeric / nullif(a.total, 0), 2) as junk_ratio,
    a.last_collected, a.sample_title
  from agg a
  where a.junk_count >= p_min_count
    and not exists (
      select 1 from exclusion_rules er
      where er.is_active and er.rule_type = 'domain'
        and (
          lower(er.value) = a.host
          or a.host like '%.' || lower(er.value)
          or a.host = regexp_replace(lower(er.value), '^www\.', '')
        )
    )
    and not exists (
      select 1 from exclusion_candidate_ignores i where i.domain = a.host
    )
  order by a.junk_count desc, junk_ratio desc
  limit 100;
$$;

-- 확인:
-- select * from exclusion_candidates(30, 3);
