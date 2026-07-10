-- 맞춤 추천 피드 개편(카테고리 방식)에 맞춰 추천 RPC를 해시태그 overlap 매칭으로 교체.
--
-- 변경점:
--  * 시그니처에 p_hashtags text[] 추가 — 앱이 사용자의 선택 카테고리를
--    src/lib/feed/categories.ts 기준으로 해시태그로 펼쳐 전달한다.
--  * personalized: content_keywords/user_preferences 조인 대신
--    contents.matched_keywords/matched_groups 배열과 p_hashtags 의 overlap 으로 매칭·스코어.
--  * service_match(개별 서비스 선호) 제거 — 서비스 구분은 더 이상 쓰지 않음.
--    기존 0.20 가중치는 keyword_match 로 흡수(0.35→0.55).
--  * recency_decay/source_weight/seen_penalty/scoring 골격은 유지.
--  * explore: 선택 카테고리 해시태그와 겹치지 않는 최신 발행물(발견용).
--  * trending/editor: 기존과 동일(해시태그 무관).
-- 착수: 2026-07-10.

-- 이전 시그니처 제거(오버로드 모호성 방지)
drop function if exists public.get_recommended_feed(uuid, text, int);

create or replace function public.get_recommended_feed(
  p_user_id  uuid,
  p_slot     text,
  p_hashtags text[] default '{}'::text[],
  p_limit    int default 6
)
returns table (
  content_id  uuid,
  score       numeric,
  slot        text,
  reason_keys text[]
)
language plpgsql
security definer
set search_path = public
as $func$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  if p_slot not in ('personalized', 'trending', 'editor', 'explore') then
    raise exception 'invalid slot: %', p_slot;
  end if;

  if p_slot = 'personalized' then
    return query
    with seen_recently as (
      select distinct cv.content_id
      from public.content_views cv
      where cv.user_id = p_user_id
        and cv.viewed_at >= now() - interval '14 days'
    ),
    scored as (
      select
        c.id as content_id,
        least(ov.match_count / 3.0, 1.0)::numeric as keyword_match,
        (exp(
          -ln(2)
          * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
          / 168.0
        ))::numeric as recency_decay,
        (case c.category
          when '가트너'     then 1.0
          when 'KRG'        then 0.9
          when '리포트'     then 0.95
          when '뉴스'       then 0.7
          when '유튜브'     then 0.6
          when '웹인사이트' then 0.65
          when '오피니언'   then 0.65
          else 0.5
        end)::numeric as source_weight,
        0::numeric as behavioral_boost,
        (case when sr.content_id is not null then 0.5 else 0 end)::numeric as seen_penalty,
        ov.matched_names as reason_keys
      from public.contents c
      left join seen_recently sr on sr.content_id = c.id
      cross join lateral (
        select
          coalesce(array_agg(distinct tag), '{}'::text[]) as matched_names,
          count(distinct tag) as match_count
        from unnest(
          coalesce(c.matched_keywords, '{}'::text[]) || coalesce(c.matched_groups, '{}'::text[])
        ) as tag
        where tag = any(p_hashtags)
      ) ov
      where c.status = 'published'
        and coalesce(c.published_at, c.created_at) >= now() - interval '5 days'
        and ov.match_count > 0
    )
    select
      scored.content_id,
      (0.55 * keyword_match
       + 0.25 * recency_decay
       + 0.10 * source_weight
       + 0.10 * behavioral_boost
       - seen_penalty)::numeric as score,
      p_slot,
      scored.reason_keys
    from scored
    order by score desc
    limit p_limit;

  elsif p_slot = 'trending' then
    return query
    with trend_counts as (
      select cv.content_id, count(*) as view_count
      from public.content_views cv
      where cv.viewed_at >= now() - interval '3 days'
      group by cv.content_id
    ),
    content_keyword_names as (
      select ck.content_id, array_agg(k.name) as names
      from public.content_keywords ck
      join public.keywords k on k.id = ck.keyword_id
      group by ck.content_id
    )
    select
      c.id,
      (exp(
        -ln(2)
        * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
        / 168.0
      ))::numeric as score,
      p_slot,
      coalesce(ckn.names, '{}'::text[])
    from trend_counts tc
    join public.contents c on c.id = tc.content_id and c.status = 'published'
    left join content_keyword_names ckn on ckn.content_id = c.id
    order by tc.view_count desc, c.id
    limit p_limit;

  elsif p_slot = 'editor' then
    return query
    select
      c.id,
      0.5::numeric as score,
      p_slot,
      '{}'::text[]
    from public.contents c
    where c.status = 'published'
      and c.is_editor_pick = true
      and coalesce(c.published_at, c.created_at) >= now() - interval '14 days'
    order by coalesce(c.published_at, c.created_at) desc
    limit p_limit;

  elsif p_slot = 'explore' then
    return query
    with seen_recently as (
      select distinct cv.content_id
      from public.content_views cv
      where cv.user_id = p_user_id
        and cv.viewed_at >= now() - interval '14 days'
    ),
    scored as (
      select
        c.id as content_id,
        (exp(
          -ln(2)
          * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
          / 168.0
        ))::numeric as recency_decay,
        (case c.category
          when '가트너'     then 1.0
          when 'KRG'        then 0.9
          when '리포트'     then 0.95
          when '뉴스'       then 0.7
          when '유튜브'     then 0.6
          when '웹인사이트' then 0.65
          when '오피니언'   then 0.65
          else 0.5
        end)::numeric as source_weight,
        (case when sr.content_id is not null then 0.5 else 0 end)::numeric as seen_penalty,
        coalesce(c.matched_keywords, '{}'::text[]) as reason_keys
      from public.contents c
      left join seen_recently sr on sr.content_id = c.id
      where c.status = 'published'
        and coalesce(c.published_at, c.created_at) >= now() - interval '5 days'
        and not (
          coalesce(c.matched_keywords, '{}'::text[]) && p_hashtags
          or coalesce(c.matched_groups, '{}'::text[]) && p_hashtags
        )
    )
    select
      scored.content_id,
      (0.25 * recency_decay
       + 0.10 * source_weight
       - seen_penalty)::numeric as score,
      p_slot,
      scored.reason_keys
    from scored
    order by score desc
    limit p_limit;
  end if;
end;
$func$;

grant execute on function public.get_recommended_feed(uuid, text, text[], int) to authenticated;
