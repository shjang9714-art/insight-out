-- 492-C: get_recommended_feed 소프트 삭제 반영 (David 적용)
-- 적용: Supabase SQL Editor. 전체 붙여넣고 RUN. 멱등(create or replace).
--
-- 배경:
--   get_recommended_feed 는 SECURITY DEFINER 라 RLS 를 우회한다. 492 소프트 삭제
--   도입 후에도 이 함수는 c.status = 'published' 만 걸고 있어, deleted_at 이 채워진
--   콘텐츠가 개인화·트렌딩·에디터·탐색 4개 슬롯에 계속 노출된다.
--
-- 변경 내용:
--   1단계 인벤토리에서 확보한 현재 함수 본문을 그대로 두고, 4개 분기 각각의
--   c.status = 'published' 바로 뒤에 and c.deleted_at is null 만 추가했다.
--   그 외 로직(가중치·정렬·limit 등)은 한 글자도 바꾸지 않았다.

CREATE OR REPLACE FUNCTION public.get_recommended_feed(p_user_id uuid, p_slot text, p_hashtags text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 6)
 RETURNS TABLE(content_id uuid, score numeric, slot text, reason_keys text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and c.deleted_at is null
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
    join public.contents c on c.id = tc.content_id and c.status = 'published' and c.deleted_at is null
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
      and c.deleted_at is null
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
        and c.deleted_at is null
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
$function$
;

-- 확인
-- select prosrc from pg_proc where proname = 'get_recommended_feed';
--   → 4곳 모두 c.deleted_at is null 조건이 들어갔는지 확인
