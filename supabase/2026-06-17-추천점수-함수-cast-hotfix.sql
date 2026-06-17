-- hotfix: PR #27 함수의 PL/pgSQL RETURN QUERY strict type check 위반 수정.
-- personalized/explore 슬롯의 exp() 결과(double precision)가 numeric 시그니처와 불일치해 500 발생.
-- 운영 DB에는 SQL Editor에서 이미 적용 완료 (2026-06-17).

create or replace function public.get_recommended_feed(
  p_user_id uuid,
  p_slot    text,
  p_limit   int default 6
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
    with keyword_match as (
      select ck.content_id,
             least(sum(up.weight) / 5.0, 1.0) as value,
             array_agg(distinct k.name) as matched_names
      from public.content_keywords ck
      join public.user_preferences up on up.keyword_id = ck.keyword_id and up.user_id = p_user_id
      join public.keywords k on k.id = ck.keyword_id
      group by ck.content_id
    ),
    service_match as (
      select cs.content_id,
             least(max(usp.weight), 1.0) as value
      from public.content_services cs
      join public.user_service_prefs usp on usp.service_id = cs.service_id and usp.user_id = p_user_id
      group by cs.content_id
    ),
    seen_recently as (
      select distinct cv.content_id
      from public.content_views cv
      where cv.user_id = p_user_id
        and cv.viewed_at >= now() - interval '14 days'
    ),
    scored as (
      select
        c.id as content_id,
        coalesce(km.value, 0)::numeric as keyword_match,
        coalesce(sm.value, 0)::numeric as service_match,
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
        coalesce(km.matched_names, '{}'::text[]) as reason_keys
      from public.contents c
      left join keyword_match km on km.content_id = c.id
      left join service_match sm on sm.content_id = c.id
      left join seen_recently sr on sr.content_id = c.id
      where c.status = 'published'
    )
    select
      scored.content_id,
      (0.35 * keyword_match
       + 0.20 * service_match
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
    with keyword_match as (
      select ck.content_id,
             least(sum(up.weight) / 5.0, 1.0) as value
      from public.content_keywords ck
      join public.user_preferences up on up.keyword_id = ck.keyword_id and up.user_id = p_user_id
      join public.keywords k on k.id = ck.keyword_id
      group by ck.content_id
    ),
    service_match as (
      select cs.content_id,
             least(max(usp.weight), 1.0) as value
      from public.content_services cs
      join public.user_service_prefs usp on usp.service_id = cs.service_id and usp.user_id = p_user_id
      group by cs.content_id
    ),
    seen_recently as (
      select distinct cv.content_id
      from public.content_views cv
      where cv.user_id = p_user_id
        and cv.viewed_at >= now() - interval '14 days'
    ),
    content_keyword_names as (
      select ck.content_id, array_agg(k.name) as names
      from public.content_keywords ck
      join public.keywords k on k.id = ck.keyword_id
      group by ck.content_id
    ),
    user_keyword_ids as (
      select up.keyword_id from public.user_preferences up where up.user_id = p_user_id
    ),
    scored as (
      select
        c.id as content_id,
        coalesce(km.value, 0)::numeric as keyword_match,
        coalesce(sm.value, 0)::numeric as service_match,
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
        ckn.names as reason_keys
      from public.contents c
      join content_keyword_names ckn on ckn.content_id = c.id
      left join keyword_match km on km.content_id = c.id
      left join service_match sm on sm.content_id = c.id
      left join seen_recently sr on sr.content_id = c.id
      where c.status = 'published'
        and not exists (
          select 1 from public.content_keywords ck
          where ck.content_id = c.id
            and ck.keyword_id in (select keyword_id from user_keyword_ids)
        )
    )
    select
      scored.content_id,
      (0.35 * keyword_match
       + 0.20 * service_match
       + 0.25 * recency_decay
       + 0.10 * source_weight
       + 0.10 * behavioral_boost
       - seen_penalty)::numeric as score,
      p_slot,
      scored.reason_keys
    from scored
    order by score desc
    limit p_limit;
  end if;
end;
$func$;

grant execute on function public.get_recommended_feed(uuid, text, int) to authenticated;
