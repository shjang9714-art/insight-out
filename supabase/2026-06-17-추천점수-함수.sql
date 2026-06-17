-- 지시서 85: 추천 피드 점수 함수
-- 사용자별 추천 콘텐츠를 슬롯(personalized/trending/editor/explore) 단위로 점수화해 반환한다.
--
-- source_weight 매핑 비고 (작업 전 실데이터 확인 결과):
--   contents.source 텍스트 컬럼은 없음. contents.category(enum)로 출처 등급을 판단한다.
--   '가트너'/'KRG'는 지시서 50에서 '리포트'로 통합되어 현재 단독 값으로는 존재하지 않으므로
--   '리포트' = 0.95(통합 전 1.0/0.9의 평균)로 매핑하고, 혹시 deprecated 값이 남아 있는 경우를
--   대비해 '가트너'/'KRG'/'오피니언' 분기도 안전망으로 유지한다.

drop function if exists public.get_recommended_feed(uuid, text, int);

create or replace function public.get_recommended_feed(
  p_user_id uuid,
  p_slot    text,    -- 'personalized' | 'trending' | 'editor' | 'explore'
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
as $$
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
        coalesce(km.value, 0) as keyword_match,
        coalesce(sm.value, 0) as service_match,
        exp(
          -ln(2)
          * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
          / 168.0
        ) as recency_decay,
        case c.category
          when '가트너'     then 1.0
          when 'KRG'        then 0.9
          when '리포트'     then 0.95
          when '뉴스'       then 0.7
          when '유튜브'     then 0.6
          when '웹인사이트' then 0.65
          when '오피니언'   then 0.65
          else 0.5
        end as source_weight,
        0::numeric as behavioral_boost, -- TODO: 1차는 0 고정. view/archive 누적 후 키워드 자카드 유사도로 활성화
        case when sr.content_id is not null then 0.5 else 0 end as seen_penalty,
        coalesce(km.matched_names, '{}') as reason_keys
      from public.contents c
      left join keyword_match km on km.content_id = c.id
      left join service_match sm on sm.content_id = c.id
      left join seen_recently sr on sr.content_id = c.id
      where c.status = 'published'
    )
    select
      content_id,
      (0.35 * keyword_match
       + 0.20 * service_match
       + 0.25 * recency_decay
       + 0.10 * source_weight
       + 0.10 * behavioral_boost
       - seen_penalty) as score,
      p_slot,
      reason_keys
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
      exp(
        -ln(2)
        * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
        / 168.0
      )::numeric as score,
      p_slot,
      coalesce(ckn.names, '{}')
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
        coalesce(km.value, 0) as keyword_match,
        coalesce(sm.value, 0) as service_match,
        exp(
          -ln(2)
          * (extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 3600.0)
          / 168.0
        ) as recency_decay,
        case c.category
          when '가트너'     then 1.0
          when 'KRG'        then 0.9
          when '리포트'     then 0.95
          when '뉴스'       then 0.7
          when '유튜브'     then 0.6
          when '웹인사이트' then 0.65
          when '오피니언'   then 0.65
          else 0.5
        end as source_weight,
        0::numeric as behavioral_boost,
        case when sr.content_id is not null then 0.5 else 0 end as seen_penalty,
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
      content_id,
      (0.35 * keyword_match
       + 0.20 * service_match
       + 0.25 * recency_decay
       + 0.10 * source_weight
       + 0.10 * behavioral_boost
       - seen_penalty) as score,
      p_slot,
      reason_keys
    from scored
    order by score desc
    limit p_limit;
  end if;
end;
$$;

grant execute on function public.get_recommended_feed(uuid, text, int) to authenticated;
