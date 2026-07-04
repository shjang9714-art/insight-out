-- 186: 소스별 수집 품질 집계 RPC. 최근 p_days 일 collected_at 기준.
-- 재료: contents.status(150), review_reason(178), body_len(130), link_ok(155), bookmark_count.
-- 후방호환: 컬럼 미존재 환경에선 이 함수 생성 전에 130/155/178 먼저 적용돼 있어야 함(모두 적용 완료 가정).

create or replace function source_quality_stats(p_days integer default 30)
returns table (
  source_id        uuid,
  total            bigint,
  published        bigint,
  pending          bigint,
  rejected         bigint,
  body_full        bigint,   -- body_len >= 400 (풀본문)
  link_checked     bigint,   -- link_ok is not null
  dead_links       bigint,   -- link_ok = false
  bookmarks        bigint,
  r_body_missing   bigint,
  r_body_short     bigint,
  r_body_truncated bigint,
  r_extract_failed bigint,
  r_low_relevance  bigint,
  r_llm_irrelevant bigint
)
language sql
stable
as $$
  select
    c.source_id,
    count(*)                                                    as total,
    count(*) filter (where c.status = 'published')              as published,
    count(*) filter (where c.status = 'pending')                as pending,
    count(*) filter (where c.status = 'rejected')               as rejected,
    count(*) filter (where c.body_len >= 400)                   as body_full,
    count(*) filter (where c.link_ok is not null)               as link_checked,
    count(*) filter (where c.link_ok = false)                   as dead_links,
    coalesce(sum(c.bookmark_count), 0)                          as bookmarks,
    count(*) filter (where c.review_reason = 'body_missing')    as r_body_missing,
    count(*) filter (where c.review_reason = 'body_short')      as r_body_short,
    count(*) filter (where c.review_reason = 'body_truncated')  as r_body_truncated,
    count(*) filter (where c.review_reason = 'extract_failed')  as r_extract_failed,
    count(*) filter (where c.review_reason = 'low_relevance')   as r_low_relevance,
    count(*) filter (where c.review_reason = 'llm_irrelevant')  as r_llm_irrelevant
  from contents c
  where c.source_id is not null
    and c.collected_at >= now() - make_interval(days => p_days)
  group by c.source_id;
$$;
