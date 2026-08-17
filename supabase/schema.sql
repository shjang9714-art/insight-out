--
-- Seoul migration: schema-only dump from Sydney (live), regenerated 2026-07-19
-- Source: nkfvgeltrgrojscrhhlg (ap-southeast-2) public schema, 63 tables + 5 views (+1 rule-backed view definition)
-- Excludes: Supabase-managed internal schemas (auth, storage, realtime, extensions, graphql, graphql_public, pgbouncer, vault)
--

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

--
-- PostgreSQL database dump
--

-- \restrict 0g4lUvC1EHN0RUcEujbYZdz2XTLCWNPeUBUjC9BOnwIdb0q99RjrWkwOIa1wRNC

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: ai_report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ai_report_status" AS ENUM (
    'draft',
    'generating',
    'completed',
    'failed'
);


--
-- Name: ai_report_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ai_report_type" AS ENUM (
    '시장동향',
    '경쟁사분석',
    '키워드분석',
    '서비스리포트',
    '자유주제'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: briefing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."briefing_status" AS ENUM (
    'draft',
    'published',
    'archived',
    'failed'
);


--
-- Name: collection_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."collection_method" AS ENUM (
    'rss',
    'api',
    'html',
    'manual',
    'youtube'
);


--
-- Name: content_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."content_category" AS ENUM (
    '뉴스',
    '가트너',
    'KRG',
    '웹인사이트',
    '오피니언',
    '뉴스레터',
    'AI보고서',
    '유튜브',
    '리포트',
    '기업자료',
    '지식보고서'
);


--
-- Name: content_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."content_status" AS ENUM (
    'pending',
    'published',
    'rejected'
);


--
-- Name: crawl_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."crawl_status" AS ENUM (
    'success',
    'partial',
    'failed'
);


--
-- Name: department; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."department" AS ENUM (
    'Enterprise사업부문',
    'SMB사업부문',
    '공공사업부문',
    '기술부문',
    '마케팅부문',
    '기타'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."entity_type" AS ENUM (
    'company',
    'tech',
    'product',
    'person',
    'policy',
    'industry'
);


--
-- Name: insight_card_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."insight_card_status" AS ENUM (
    'draft',
    'published',
    'archived'
);


--
-- Name: issue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."issue_status" AS ENUM (
    'draft',
    'published',
    'archived'
);


--
-- Name: newsletter_frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."newsletter_frequency" AS ENUM (
    'daily',
    'weekly',
    'none',
    'twice_weekly'
);


--
-- Name: signal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."signal_type" AS ENUM (
    '경쟁사동향',
    '규제·정부',
    '신제품·출시',
    '투자·M&A',
    '기술트렌드',
    '시장지표',
    '파트너십',
    '인사·조직'
);


--
-- Name: source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."source_type" AS ENUM (
    'news_site',
    'report_publisher',
    'web_insight',
    'newsletter',
    'youtube_channel'
);


--
-- Name: tag_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tag_type" AS ENUM (
    'industry',
    'company',
    'tech',
    'market',
    'policy',
    'content_type'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


--
-- Name: contents_search_vector_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."contents_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')),              'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary_ko, '')),         'B') ||
    setweight(to_tsvector('simple', coalesce(new.body_translated_ko, '')), 'C');
  return new;
end;
$$;


--
-- Name: entity_cooccurrence(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."entity_cooccurrence"("p_min_weight" integer DEFAULT 3, "p_limit" integer DEFAULT 400) RETURNS TABLE("source" "uuid", "target" "uuid", "weight" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select a.entity_id as source, b.entity_id as target, count(*) as weight
  from public.content_entities a
  join public.content_entities b
    on a.content_id = b.content_id
   and a.entity_id < b.entity_id        -- 무방향·중복 제거
  group by a.entity_id, b.entity_id
  having count(*) >= greatest(p_min_weight, 1)
  order by count(*) desc
  limit least(greatest(p_limit, 1), 1000)
$$;


--
-- Name: entity_neighbors("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."entity_neighbors"("p_entity_id" "uuid", "p_limit" integer DEFAULT 20, "p_min_weight" integer DEFAULT 1) RETURNS TABLE("entity_id" "uuid", "weight" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    case when a.entity_id = p_entity_id then b.entity_id else a.entity_id end as entity_id,
    sum(case when c.collected_at >= now() - interval '30 days' then 2 else 1 end)::bigint as weight
  from public.content_entities a
  join public.content_entities b
    on a.content_id = b.content_id and a.entity_id < b.entity_id
  join public.contents c on c.id = a.content_id
   and c.status = 'published'          -- ★ 추가: 공개 기사에서만 관계를 만든다
  where a.entity_id = p_entity_id or b.entity_id = p_entity_id
  group by 1
  having sum(case when c.collected_at >= now() - interval '30 days' then 2 else 1 end) >= greatest(p_min_weight, 1)
  order by 2 desc
  limit least(greatest(p_limit, 1), 50)
$$;


--
-- Name: entity_pair_contents("uuid", "uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer DEFAULT 5) RETURNS TABLE("content_id" "uuid", "title" "text", "collected_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select c.id, c.title, c.collected_at
  from public.content_entities ca
  join public.content_entities cb on ca.content_id = cb.content_id
  join public.contents c on c.id = ca.content_id
  where ca.entity_id = p_a and cb.entity_id = p_b and ca.entity_id <> cb.entity_id
    and c.status = 'published'
  order by c.collected_at desc
  limit least(greatest(p_limit, 1), 20)
$$;


--
-- Name: exclusion_candidates(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."exclusion_candidates"("p_days" integer DEFAULT 30, "p_min_count" integer DEFAULT 3) RETURNS TABLE("domain" "text", "total" bigint, "junk_count" bigint, "pending" bigint, "rejected" bigint, "junk_ratio" numeric, "last_collected" timestamp with time zone, "sample_title" "text")
    LANGUAGE "sql" STABLE
    AS $$
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


--
-- Name: get_recommended_feed("uuid", "text", "text"[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_recommended_feed"("p_user_id" "uuid", "p_slot" "text", "p_hashtags" "text"[] DEFAULT '{}'::"text"[], "p_limit" integer DEFAULT 6) RETURNS TABLE("content_id" "uuid", "score" numeric, "slot" "text", "reason_keys" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


--
-- Name: get_translation_usage_this_month(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_translation_usage_this_month"() RETURNS TABLE("provider" "text", "char_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT provider, char_count
  FROM public.translation_usage
  WHERE year  = EXTRACT(YEAR  FROM now())::smallint
    AND month = EXTRACT(MONTH FROM now())::smallint;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email       text := lower(coalesce(new.email, ''));
  v_is_corp     boolean;
  v_allowlisted boolean;
  v_is_admin    boolean;
begin
  -- ① 사내 도메인인가 (339 — Hook 이 아니라 DB 가 판정한다)
  v_is_corp := v_email like '%@lguplus.co.kr';

  -- ② allowlist 에 있는가 (관리자 Google · 예외 계정)
  select coalesce(a.is_admin, false), true
    into v_is_admin, v_allowlisted
    from public.signup_email_allowlist a
   where lower(a.email) = v_email
   limit 1;

  v_allowlisted := coalesce(v_allowlisted, false);
  v_is_admin    := coalesce(v_is_admin, false);

  -- ③ ⭐ 둘 다 아니면 가입 자체를 막는다 (fail-closed)
  --    Supabase Hook 이 꺼져 있어도 여기서 걸린다.
  if not v_is_corp and not v_allowlisted then
    raise exception '사내 이메일(@lguplus.co.kr) 계정만 가입할 수 있습니다.'
      using errcode = 'P0001';
  end if;

  -- ④ 승인·role 은 240 과 동일하게 유지 (David 결정 — 승인 절차 복원은 폐기)
  insert into public.users (id, email, approval_status, approved_at, role)
  values (
    new.id,
    coalesce(new.email, ''),
    'approved',
    now(),
    (case when v_is_admin then 'admin' else 'user' end)::public.user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


--
-- Name: hook_restrict_signup_by_email_domain("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."hook_restrict_signup_by_email_domain"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_email  text := lower(event->'user'->>'email');
  v_domain text := split_part(lower(event->'user'->>'email'), '@', 2);
begin
  if v_domain = 'lguplus.co.kr'
     or exists (
       select 1 from public.signup_email_allowlist a
       where lower(a.email) = v_email
     )
  then
    return '{}'::jsonb;              -- 허용
  end if;

  return jsonb_build_object(         -- 거부(클라이언트에 메시지 전파)
    'error', jsonb_build_object(
      'http_code', 403,
      'message', '사내 이메일(@lguplus.co.kr) 계정만 가입할 수 있습니다.'
    )
  );
end;
$$;


--
-- Name: increment_exclusion_hits("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_exclusion_hits"("hits" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update exclusion_rules e
  set hit_count   = e.hit_count + (d.delta)::int,
      last_hit_at = now(),
      updated_at  = now()
  from (
    select key::uuid as rule_id, value::int as delta
    from jsonb_each_text(hits)
  ) d
  where e.id = d.rule_id
    and (d.delta)::int > 0;
$$;


--
-- Name: increment_llm_usage("text", "text", bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_llm_usage"("p_provider" "text", "p_period" "text", "p_tokens" bigint, "p_calls" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.llm_usage (provider, period, tokens, calls, updated_at)
  values (p_provider, p_period, greatest(p_tokens, 0), greatest(p_calls, 0), now())
  on conflict (provider, period) do update
  set tokens     = public.llm_usage.tokens + excluded.tokens,
      calls      = public.llm_usage.calls  + excluded.calls,
      updated_at = now();
$$;


--
-- Name: increment_translation_usage("text", "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_translation_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total bigint;
begin
  insert into public.translation_usage (provider, period, chars, updated_at)
  values (p_provider, p_period, p_chars, now())
  on conflict (provider, period)
  do update set
    chars      = translation_usage.chars + excluded.chars,
    updated_at = now()
  returning chars into v_total;

  return v_total;
end;
$$;


--
-- Name: increment_tts_usage("text", "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_tts_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.tts_usage (provider, period, chars, updated_at)
  values (p_provider, p_period, greatest(p_chars, 0), now())
  on conflict (provider, period) do update
  set chars = public.tts_usage.chars + excluded.chars,
      updated_at = now();
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;


--
-- Name: lock_approval_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."lock_approval_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- service_role(어드민 서버 액션·백엔드)만 이 컬럼들을 바꿀 수 있다.
  -- anon/authenticated 가 바꾸려 하면 조용히 옛 값으로 되돌린다.
  if current_user <> 'service_role' then
    new.approval_status := old.approval_status;
    new.approved_at     := old.approved_at;
    new.approved_by     := old.approved_by;
    new.role            := old.role;   -- ⭐ 334 — 자기 admin 승격 차단
  end if;
  return new;
end;
$$;


--
-- Name: merge_entities("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."merge_entities"("p_source" "uuid", "p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
begin
  -- 521 — 서버 액션(service role)은 앱 레벨 requireAdminAction 게이트로 이미 인가되므로
  -- is_admin() 검사를 건너뛴다. 이 함수는 SECURITY DEFINER라 current_user/session_user가
  -- 항상 postgres/authenticator로 고정되어 호출자를 반영하지 않으므로(lock_approval_columns의
  -- current_user 판별과 달리) PostgREST가 넣어주는 request.jwt.claims의 role로 판별한다.
  if v_caller_role <> 'service_role' and not public.is_admin() then
    raise exception '관리자만 병합할 수 있습니다.';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    return;
  end if;

  -- 1) content_entities: 양쪽이 같은 콘텐츠에 링크된 경우 unique(content_id,entity_id) 충돌 →
  --    소스의 중복 링크 먼저 삭제한 뒤 나머지를 타깃으로 이전
  delete from public.content_entities cs
  where cs.entity_id = p_source
    and exists (
      select 1 from public.content_entities ct
      where ct.entity_id = p_target and ct.content_id = cs.content_id
    );
  update public.content_entities set entity_id = p_target where entity_id = p_source;

  -- 2) alias 이전 (alias 는 글로벌 unique 라 충돌 없음)
  update public.entity_aliases set entity_id = p_target where entity_id = p_source;

  -- 3) 소스의 canonical_name 을 타깃 alias 로 보존 (이미 있으면 무시)
  insert into public.entity_aliases (entity_id, alias)
  select p_target, e.canonical_name from public.entities e where e.id = p_source
  on conflict (lower(alias)) do nothing;

  -- 4) 소스 엔티티 삭제 (잔여 링크/alias 는 cascade)
  delete from public.entities where id = p_source;

  -- 5) 타깃 mention_count 재계산
  update public.entities e
  set mention_count = (
    select count(*) from public.content_entities ce where ce.entity_id = p_target
  )
  where e.id = p_target;
end;
$$;


--
-- Name: resolve_matched_keyword_casing("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."resolve_matched_keyword_casing"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select k
  from (
    select unnest(matched_keywords) as k, collected_at
    from public.contents
    where status = 'published'
      and collected_at >= now() - interval '90 days'
  ) matched
  where lower(k) = lower(p_name)
  order by collected_at desc
  limit 1
$$;


--
-- Name: set_ops_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."set_ops_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.resolved_at := now();
  end if;
  return new;
end $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: source_quality_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."source_quality_stats"("p_days" integer DEFAULT 30) RETURNS TABLE("source_id" "uuid", "total" bigint, "published" bigint, "pending" bigint, "rejected" bigint, "body_full" bigint, "link_checked" bigint, "dead_links" bigint, "bookmarks" bigint, "r_body_missing" bigint, "r_body_short" bigint, "r_body_truncated" bigint, "r_extract_failed" bigint, "r_low_relevance" bigint, "r_llm_irrelevant" bigint)
    LANGUAGE "sql" STABLE
    AS $$
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


--
-- Name: sync_content_bookmark_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."sync_content_bookmark_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (tg_op = 'INSERT') and new.content_id is not null then
    update public.contents
      set bookmark_count = bookmark_count + 1
      where id = new.content_id;
  elsif (tg_op = 'DELETE') and old.content_id is not null then
    update public.contents
      set bookmark_count = greatest(bookmark_count - 1, 0)
      where id = old.content_id;
  end if;
  return null;
end;
$$;


--
-- Name: sync_has_password(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."sync_has_password"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.users
     set has_password = (new.encrypted_password is not null
                         and length(new.encrypted_password) > 0)
   where id = new.id;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: ai_report_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ai_report_sources" (
    "ai_report_id" "uuid" NOT NULL,
    "content_id" "uuid",
    "youtube_video_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "issue_id" "uuid",
    CONSTRAINT "ai_report_sources_one_item" CHECK (((((("content_id" IS NOT NULL))::integer + (("youtube_video_id" IS NOT NULL))::integer) + (("issue_id" IS NOT NULL))::integer) = 1))
);


--
-- Name: ai_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ai_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."ai_report_type" NOT NULL,
    "status" "public"."ai_report_status" DEFAULT 'draft'::"public"."ai_report_status" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "prompt" "text",
    "body_md" "text",
    "file_path" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "body_html" "text",
    "summary" "text",
    "cover_image_url" "text",
    "publisher" "text" DEFAULT '인사이트 아웃'::"text",
    "published_at" timestamp with time zone,
    "topic" "text"
);


--
-- Name: archive_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."archive_items" (
    "archive_id" "uuid" NOT NULL,
    "content_id" "uuid",
    "youtube_video_id" "uuid",
    "note" "text",
    "order" integer DEFAULT 0 NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_report_id" "uuid",
    CONSTRAINT "archive_items_one_item" CHECK (((((("content_id" IS NOT NULL))::integer + (("youtube_video_id" IS NOT NULL))::integer) + (("ai_report_id" IS NOT NULL))::integer) = 1))
);


--
-- Name: archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."archives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content_id" "uuid",
    "youtube_video_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_report_id" "uuid",
    CONSTRAINT "bookmarks_one_item" CHECK (((((("content_id" IS NOT NULL))::integer + (("youtube_video_id" IS NOT NULL))::integer) + (("ai_report_id" IS NOT NULL))::integer) = 1))
);


--
-- Name: briefings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."briefings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "briefing_date" "date" NOT NULL,
    "title" "text",
    "script" "text",
    "source_content_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "audio_url" "text",
    "audio_duration_seconds" integer,
    "voice" "text" DEFAULT 'ko-KR-Wavenet-C'::"text",
    "status" "public"."briefing_status" DEFAULT 'draft'::"public"."briefing_status" NOT NULL,
    "generated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "highlights" "jsonb",
    "error_reason" "text"
);


--
-- Name: COLUMN "briefings"."highlights"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."briefings"."highlights" IS '오늘의 핵심 인사이트 3줄: [{content_id, insight}] 형태. generate-briefing/백필에서 채움.';


--
-- Name: company_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."company_documents" (
    "content_id" "uuid" NOT NULL,
    "entity_id" "uuid",
    "doc_type" "text" NOT NULL,
    "doc_group" "text" NOT NULL,
    "is_official" boolean DEFAULT false NOT NULL,
    "source_kind" "text" NOT NULL,
    "page_count" integer,
    "published_on" "date",
    "official_status" "text" DEFAULT '공식원문링크'::"text" NOT NULL,
    "access_scope" "text" DEFAULT 'public'::"text" NOT NULL,
    "version_group_id" "uuid",
    "prev_content_id" "uuid",
    "ingest_status" "text" DEFAULT 'auto'::"text" NOT NULL,
    "review_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "dart_rcept_no" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_documents_doc_group_check" CHECK (("doc_group" = ANY (ARRAY['회사및사업'::"text", '기술및제품'::"text", '투자및경영'::"text"]))),
    CONSTRAINT "company_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['회사소개'::"text", 'IR·실적'::"text", '전략·보고서'::"text", 'ESG'::"text", '기술·제품'::"text", '투자·피치덱'::"text", '행사·발표'::"text"]))),
    CONSTRAINT "company_documents_page_count_check" CHECK ((("page_count" IS NULL) OR ("page_count" > 0))),
    CONSTRAINT "company_documents_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['API'::"text", 'RSS'::"text", 'SITEMAP'::"text", 'HTML_LIST'::"text", 'HTML_DETAIL'::"text", 'DOCUMENT_DIRECTORY'::"text", 'HEADLESS_BROWSER'::"text", 'MANUAL'::"text"])))
);


--
-- Name: competitor_weekly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."competitor_weekly_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "summary" "text",
    "overall_impact" "text",
    "emerging_topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competitor_weekly_reports_overall_impact_check" CHECK (("overall_impact" = ANY (ARRAY['위기'::"text", '기회'::"text", '관망'::"text"]))),
    CONSTRAINT "competitor_weekly_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


--
-- Name: competitor_weekly_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."competitor_weekly_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "generate_dow" smallint DEFAULT 1 NOT NULL,
    "generate_hour" smallint DEFAULT 6 NOT NULL,
    "auto_publish" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competitor_weekly_settings_generate_dow_check" CHECK ((("generate_dow" >= 0) AND ("generate_dow" <= 6))),
    CONSTRAINT "competitor_weekly_settings_generate_hour_check" CHECK ((("generate_hour" >= 0) AND ("generate_hour" <= 23))),
    CONSTRAINT "competitor_weekly_settings_id_check" CHECK ("id")
);


--
-- Name: content_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."content_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'rule'::"text" NOT NULL,
    "score" numeric DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: content_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."content_keywords" (
    "content_id" "uuid" NOT NULL,
    "keyword_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: content_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."content_services" (
    "content_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: content_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."content_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid" NOT NULL,
    "signal_type" "public"."signal_type" NOT NULL,
    "score" numeric DEFAULT 1.0 NOT NULL,
    "source" "text" DEFAULT 'rule'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: content_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."content_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dwell_seconds" integer DEFAULT 0 NOT NULL
);


--
-- Name: contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "public"."content_category" NOT NULL,
    "source_id" "uuid",
    "title" "text" NOT NULL,
    "title_original" "text",
    "summary_ko" "text",
    "body_original" "text",
    "body_translated_ko" "text",
    "original_language" "text" DEFAULT 'ko'::"text" NOT NULL,
    "author" "text",
    "original_url" "text",
    "thumbnail_url" "text",
    "file_path" "text",
    "title_hash" "text",
    "body_hash" "text",
    "view_count" integer DEFAULT 0 NOT NULL,
    "bookmark_count" integer DEFAULT 0 NOT NULL,
    "is_editor_pick" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "collected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "search_vector" "tsvector",
    "status" "public"."content_status" DEFAULT 'published'::"public"."content_status" NOT NULL,
    "cluster_id" "uuid",
    "body_fetched_at" timestamp with time zone,
    "importance_score" numeric DEFAULT 0 NOT NULL,
    "matched_groups" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "matched_keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sentiment" "text",
    "body_len" integer GENERATED ALWAYS AS ("char_length"("body_original")) STORED,
    "signals_classified_at" timestamp with time zone,
    "link_ok" boolean,
    "link_checked_at" timestamp with time zone,
    "review_reason" "text",
    "canonical_url" "text",
    "body_markdown" "text",
    "thumbnail_fetched_at" timestamp with time zone,
    "cluster_checked_at" timestamp with time zone,
    "lgu_impact" "text",
    "transcript" "text",
    "transcript_ko" "text",
    "transcript_lang" "text",
    "transcript_fetched_at" timestamp with time zone,
    "summary_attempted_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "contents_lgu_impact_check" CHECK ((("lgu_impact" IS NULL) OR ("lgu_impact" = ANY (ARRAY['위기'::"text", '기회'::"text", '관망'::"text"])))),
    CONSTRAINT "contents_sentiment_check" CHECK ((("sentiment" IS NULL) OR ("sentiment" = ANY (ARRAY['긍정'::"text", '중립'::"text", '부정'::"text"]))))
);


--
-- Name: COLUMN "contents"."sentiment"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."sentiment" IS '경쟁사 기사 논조(LLM 분석) — 긍정/중립/부정, null = 미분석. 시장 톤 기준(LGU+ 위협도 아님).';


--
-- Name: COLUMN "contents"."deleted_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."deleted_at" IS '492: 소프트 삭제 시각. null 이면 정상. 30일 후 자동 영구 삭제.';


--
-- Name: COLUMN "contents"."body_markdown"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."body_markdown" IS '어드민 수기 작성 콘텐츠의 마크다운 원본(붙여넣기/URL 임포트 서식 편집, 지시서 212). null=평문. 검색·스니펫은 body_original(평문) 사용.';


--
-- Name: COLUMN "contents"."thumbnail_fetched_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."thumbnail_fetched_at" IS '크롤 콘텐츠 og:image 썸네일 재수집 시도 시각(지시서 219). null=미시도(재시도 대상). 성공·실패 무관하게 1회 시도 후 기록 → 무한 재시도 방지.';


--
-- Name: COLUMN "contents"."cluster_checked_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."cluster_checked_at" IS '관련기사 재클러스터링(본문 유사도) 재평가 시각(지시서 220). null=미평가(백필 대상). 성공·무매칭 무관 1회 평가 후 기록.';


--
-- Name: COLUMN "contents"."lgu_impact"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."contents"."lgu_impact" IS 'LG U+ 전략 관점의 뉴스 영향 — 위기/기회/관망. LLM 온디맨드 백필(241). null=미분석. sentiment와 독립.';


--
-- Name: crawl_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."crawl_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid",
    "status" "public"."crawl_status" NOT NULL,
    "fetched_count" integer DEFAULT 0 NOT NULL,
    "inserted_count" integer DEFAULT 0 NOT NULL,
    "duplicate_count" integer DEFAULT 0 NOT NULL,
    "held_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rejected_count" integer DEFAULT 0 NOT NULL,
    "rejected_by" "jsonb"
);


--
-- Name: COLUMN "crawl_logs"."rejected_count"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."crawl_logs"."rejected_count" IS '품질 게이트·제외 규칙으로 버려진 건수(312). fetched = inserted + duplicate + held + rejected 가 맞아야 한다.';


--
-- Name: COLUMN "crawl_logs"."rejected_by"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."crawl_logs"."rejected_by" IS '제외 사유별 건수(312). 합계는 rejected_count 와 일치해야 한다.';


--
-- Name: crawl_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."crawl_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "min_body_length" integer DEFAULT 250 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crawl_settings_id_check" CHECK ("id")
);


--
-- Name: curated_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."curated_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "groups" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_competitor" boolean DEFAULT false NOT NULL,
    "entity_id" "uuid",
    "role" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: curated_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."curated_groups" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "display_mode" "text" DEFAULT 'always'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curated_groups_display_mode_check" CHECK (("display_mode" = ANY (ARRAY['always'::"text", 'on_issue'::"text"]))),
    CONSTRAINT "curated_groups_kind_check" CHECK (("kind" = ANY (ARRAY['competitor'::"text", 'watchlist'::"text"])))
);


--
-- Name: daily_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."daily_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_of" "date" NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "needs_review" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "category" "text",
    "headline" "text" NOT NULL,
    "summary_ko" "text" NOT NULL,
    "market_trend" "text",
    "competitor_trend" "text",
    "implication" "text",
    "source_articles" "jsonb",
    "related_past" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week_of" "date",
    "competitor_matrix" "jsonb",
    "why_it_matters" "text",
    "implication_lenses" "jsonb",
    "next_steps" "jsonb"
);


--
-- Name: document_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."document_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "source_kind" "text" NOT NULL,
    "collect_method" "text" NOT NULL,
    "target_file_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "interval_minutes" integer,
    "last_crawled_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "error_state" "text",
    "auto_publish" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_sources_interval_minutes_check" CHECK ((("interval_minutes" IS NULL) OR ("interval_minutes" > 0))),
    CONSTRAINT "document_sources_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['API'::"text", 'RSS'::"text", 'SITEMAP'::"text", 'HTML_LIST'::"text", 'HTML_DETAIL'::"text", 'DOCUMENT_DIRECTORY'::"text", 'HEADLESS_BROWSER'::"text", 'MANUAL'::"text"])))
);


--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canonical_name" "text" NOT NULL,
    "entity_type" "public"."entity_type" NOT NULL,
    "description" "text",
    "is_competitor" boolean DEFAULT false NOT NULL,
    "service_id" "uuid",
    "mention_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "competitor_group" "text",
    "parent_id" "uuid",
    CONSTRAINT "entities_parent_not_self" CHECK ((("parent_id" IS NULL) OR ("parent_id" <> "id")))
);


--
-- Name: entity_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."entity_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "alias" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: entity_dart_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."entity_dart_map" (
    "entity_id" "uuid" NOT NULL,
    "corp_code" "text" NOT NULL,
    "corp_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entity_dart_map_corp_code_check" CHECK (("corp_code" ~ '^[0-9]{8}$'::"text"))
);


--
-- Name: entity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."entity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "event_date" "date" NOT NULL,
    "signal_type" "text",
    "headline" "text" NOT NULL,
    "detail" "text",
    "sentiment" "text",
    "source_content_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "citations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "biz_impact" "text",
    "biz_impact_reason" "text",
    CONSTRAINT "entity_events_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['긍정'::"text", '중립'::"text", '부정'::"text"]))),
    CONSTRAINT "entity_events_biz_impact_check" CHECK (("biz_impact" = ANY (ARRAY['crisis'::"text", 'opportunity'::"text", 'neutral'::"text"])))
);


--
-- Name: issue_contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."issue_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'rule'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "status" "public"."issue_status" DEFAULT 'draft'::"public"."issue_status" NOT NULL,
    "match_keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text" DEFAULT 'claude'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brief" "jsonb",
    "brief_generated_at" timestamp with time zone,
    "brief_model" "text"
);


--
-- Name: entity_issues; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."entity_issues" AS
 SELECT DISTINCT "ce"."entity_id",
    "ic"."issue_id",
    "i"."title" AS "issue_title"
   FROM (("public"."content_entities" "ce"
     JOIN "public"."issue_contents" "ic" ON (("ic"."content_id" = "ce"."content_id")))
     JOIN "public"."issues" "i" ON (("i"."id" = "ic"."issue_id")));


--
-- Name: entity_signal_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."entity_signal_summary" AS
 SELECT "e"."id" AS "entity_id",
    "e"."canonical_name",
    ("e"."entity_type")::"text" AS "entity_type",
    "e"."is_competitor",
    "count"(DISTINCT "c"."id") AS "content_count",
    "count"(DISTINCT "cs"."id") AS "signal_count",
    "array_agg"(DISTINCT ("cs"."signal_type")::"text") FILTER (WHERE ("cs"."signal_type" IS NOT NULL)) AS "signal_types",
    "max"("c"."published_at") AS "last_seen"
   FROM ((("public"."entities" "e"
     JOIN "public"."content_entities" "ce" ON (("ce"."entity_id" = "e"."id")))
     JOIN "public"."contents" "c" ON (("c"."id" = "ce"."content_id")))
     LEFT JOIN "public"."content_signals" "cs" ON (("cs"."content_id" = "c"."id")))
  GROUP BY "e"."id", "e"."canonical_name", "e"."entity_type", "e"."is_competitor";


--
-- Name: exclusion_candidate_ignores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."exclusion_candidate_ignores" (
    "domain" "text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: exclusion_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."exclusion_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_type" "text" NOT NULL,
    "value" "text" NOT NULL,
    "action" "text" DEFAULT 'reject'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "hit_count" integer DEFAULT 0 NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_hit_at" timestamp with time zone
);


--
-- Name: homepage_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."homepage_sections" (
    "section_key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "homepage_sections"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."homepage_sections" IS '공개 홈(/dashboard) 섹션 노출·순서 구성. section_key 는 코드 레지스트리(HOME_SECTION_REGISTRY)와 1:1.';


--
-- Name: insight_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."insight_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "scope" "text" DEFAULT 'industry'::"text" NOT NULL,
    "topic" "text" NOT NULL,
    "headline" "text" NOT NULL,
    "implication" "text",
    "source_content_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "citations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "public"."insight_card_status" DEFAULT 'draft'::"public"."insight_card_status" NOT NULL,
    "generated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "card_headline" "text"
);


--
-- Name: issue_evidence; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."issue_evidence" AS
SELECT
    NULL::"uuid" AS "issue_id",
    NULL::"uuid" AS "content_id",
    NULL::"text" AS "title",
    NULL::"text" AS "summary_ko",
    NULL::"text" AS "original_url",
    NULL::"text" AS "thumbnail_url",
    NULL::"text" AS "category",
    NULL::timestamp with time zone AS "published_at",
    NULL::"text" AS "source_name",
    NULL::"text"[] AS "signal_types",
    NULL::numeric AS "max_signal_score",
    NULL::bigint AS "signal_count";


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."job_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_key" "text" NOT NULL,
    "trigger" "text" NOT NULL,
    "mode" "text",
    "started_by" "uuid",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "processed" integer,
    "filled" integer,
    "skipped_count" integer,
    "remaining" integer,
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "job_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "job_runs_trigger_check" CHECK (("trigger" = ANY (ARRAY['cron'::"text", 'admin'::"text"])))
);


--
-- Name: key_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."key_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_of" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "display_order" integer,
    "is_featured" boolean DEFAULT false NOT NULL,
    "category" "text",
    "headline" "text" NOT NULL,
    "summary_ko" "text" NOT NULL,
    "implication" "text",
    "source_name" "text",
    "published_at" "date",
    "source_url" "text",
    "is_new" boolean DEFAULT false NOT NULL,
    "needs_verify" boolean DEFAULT false NOT NULL,
    "issue_id" "uuid",
    "related_past" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: keyword_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."keyword_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "tag_type" "public"."tag_type" DEFAULT 'industry'::"public"."tag_type" NOT NULL,
    "description" "text",
    "include_patterns" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "exclude_patterns" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "weight" numeric DEFAULT 1.0 NOT NULL,
    "signal_hint" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "search_seeds" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


--
-- Name: keyword_insight_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."keyword_insight_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "insight_text" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: keyword_rise_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."keyword_rise_factors" (
    "keyword" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "overview" "text" DEFAULT ''::"text" NOT NULL,
    "factors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "keyword_rise_factors_factors_check" CHECK (("jsonb_typeof"("factors") = 'array'::"text")),
    CONSTRAINT "keyword_rise_factors_keyword_check" CHECK ((("keyword" = "lower"("btrim"("keyword"))) AND ("keyword" <> ''::"text"))),
    CONSTRAINT "keyword_rise_factors_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


--
-- Name: keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."keywords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "service_id" "uuid",
    "is_competitor" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: llm_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."llm_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "label" "text",
    "strengths" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "context_tokens" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: llm_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."llm_prompts" (
    "key" "text" NOT NULL,
    "label" "text",
    "prompt_text" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: llm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."llm_settings" (
    "provider" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "monthly_token_limit" bigint DEFAULT 1000000 NOT NULL
);


--
-- Name: llm_task_routing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."llm_task_routing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_type" "text" NOT NULL,
    "priority" integer NOT NULL,
    "provider" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_error" "text",
    "last_error_at" timestamp with time zone
);


--
-- Name: llm_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."llm_usage" (
    "provider" "text" NOT NULL,
    "period" "text" NOT NULL,
    "tokens" bigint DEFAULT 0 NOT NULL,
    "calls" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: mcp_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mcp_audit_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "token_id" "uuid",
    "tool" "text" NOT NULL,
    "target_table" "text",
    "target_id" "text",
    "args" "jsonb",
    "ok" boolean DEFAULT true NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "mcp_audit_log"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."mcp_audit_log" IS '190: MCP 쓰기 툴 호출 감사 로그. 읽기 툴은 기록하지 않음.';


--
-- Name: mcp_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS "public"."mcp_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mcp_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."mcp_audit_log_id_seq" OWNED BY "public"."mcp_audit_log"."id";


--
-- Name: mcp_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."mcp_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "token_prefix" "text" DEFAULT ''::"text" NOT NULL,
    "scopes" "text"[] DEFAULT '{read,ops}'::"text"[] NOT NULL,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "mcp_tokens"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."mcp_tokens" IS '190: MCP 팀원별 액세스 토큰. 평문 미저장(sha256 해시만).';


--
-- Name: COLUMN "mcp_tokens"."scopes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."mcp_tokens"."scopes" IS 'read=조회 · ops=작업기록 · reports=전략보고서 · insights=핵심인사이트 · publish=즉시 발행 허용(없으면 초안까지만)';


--
-- Name: newsletter_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."newsletter_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sent_on" "date" NOT NULL,
    "subject" "text" NOT NULL,
    "content_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "recipient_cnt" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "triggered_by" "text" DEFAULT 'cron'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb"
);


--
-- Name: newsletter_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."newsletter_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "message_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: newsletter_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."newsletter_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "send_hour_kst" smallint DEFAULT 8 NOT NULL,
    "send_days" smallint[] DEFAULT '{1}'::smallint[] NOT NULL,
    "card_count" smallint DEFAULT 5 NOT NULL,
    "subject_tpl" "text" DEFAULT 'Insight Out 뉴스레터 · {date}'::"text" NOT NULL,
    "last_sent_on" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_settings_card_count_check" CHECK ((("card_count" >= 1) AND ("card_count" <= 10))),
    CONSTRAINT "newsletter_settings_send_hour_kst_check" CHECK ((("send_hour_kst" >= 0) AND ("send_hour_kst" <= 23))),
    CONSTRAINT "newsletter_settings_singleton" CHECK (("id" = 1))
);


--
-- Name: newsletter_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."newsletter_subscriptions" (
    "user_id" "uuid" NOT NULL,
    "frequency" "public"."newsletter_frequency" DEFAULT 'weekly'::"public"."newsletter_frequency" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "newsletter_email" "text",
    "unsubscribe_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


--
-- Name: ops_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ops_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_type" "text" DEFAULT 'request'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "owner" "text",
    "ref" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "phase" "text",
    "seq" integer
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: signup_email_allowlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."signup_email_allowlist" (
    "email" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL
);


--
-- Name: sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."source_type" NOT NULL,
    "url" "text",
    "rss_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "crawl_interval_minutes" integer,
    "last_crawled_at" timestamp with time zone,
    "order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_name" "text",
    "collection_method" "public"."collection_method" DEFAULT 'rss'::"public"."collection_method" NOT NULL,
    "trust_tier" smallint DEFAULT 1 NOT NULL
);


--
-- Name: translation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."translation_settings" (
    "provider" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: translation_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."translation_usage" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "period" "text" NOT NULL,
    "chars" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "translation_usage_provider_check" CHECK (("provider" = ANY (ARRAY['deepl'::"text", 'papago'::"text", 'google'::"text"])))
);


--
-- Name: TABLE "translation_usage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."translation_usage" IS '번역 API 프로바이더별 월(period)별 문자 사용량 — 코드 정합(provider, period, chars)';


--
-- Name: translation_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."translation_usage" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."translation_usage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: trending_issue_articles; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."trending_issue_articles" AS
 SELECT "ic"."issue_id",
    "c"."id" AS "content_id",
    "c"."title",
    "c"."collected_at",
    "e"."canonical_name" AS "entity_name",
    ("e"."entity_type")::"text" AS "entity_type",
    "c"."matched_keywords"
   FROM (((("public"."issue_contents" "ic"
     JOIN "public"."contents" "c" ON (("c"."id" = "ic"."content_id")))
     JOIN "public"."issues" "i" ON (("i"."id" = "ic"."issue_id")))
     LEFT JOIN "public"."content_entities" "ce" ON (("ce"."content_id" = "c"."id")))
     LEFT JOIN "public"."entities" "e" ON (("e"."id" = "ce"."entity_id")))
  WHERE (("i"."status" = 'published'::"public"."issue_status") AND ("c"."status" = 'published'::"public"."content_status") AND ("c"."collected_at" >= ("now"() - '72:00:00'::interval)));


--
-- Name: trending_keywords; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."trending_keywords" AS
 SELECT "i"."id" AS "issue_id",
    "i"."title",
    "count"("c"."id") FILTER (WHERE ("c"."collected_at" >= ("now"() - '72:00:00'::interval))) AS "recent_count",
    "count"("c"."id") FILTER (WHERE (("c"."collected_at" >= ("now"() - '144:00:00'::interval)) AND ("c"."collected_at" < ("now"() - '72:00:00'::interval)))) AS "prev_count"
   FROM (("public"."issues" "i"
     JOIN "public"."issue_contents" "ic" ON (("ic"."issue_id" = "i"."id")))
     JOIN "public"."contents" "c" ON (("c"."id" = "ic"."content_id")))
  WHERE (("i"."status" = 'published'::"public"."issue_status") AND ("c"."status" = 'published'::"public"."content_status"))
  GROUP BY "i"."id", "i"."title"
 HAVING ("count"("c"."id") FILTER (WHERE ("c"."collected_at" >= ("now"() - '72:00:00'::interval))) >= 2)
  ORDER BY ("count"("c"."id") FILTER (WHERE ("c"."collected_at" >= ("now"() - '72:00:00'::interval)))) DESC;


--
-- Name: trending_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."trending_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "rank" integer NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "content_id" "uuid",
    "headline" "text" NOT NULL,
    "hashtag" "text",
    "today_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tts_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."tts_usage" (
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "period" "text" NOT NULL,
    "chars" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tts_usage_chars_check" CHECK (("chars" >= 0))
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "keyword_id" "uuid" NOT NULL,
    "weight" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_preferences_source_check" CHECK (("source" = ANY (ARRAY['onboarding'::"text", 'behavioral'::"text"])))
);


--
-- Name: user_service_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_service_prefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "weight" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_service_prefs_source_check" CHECK (("source" = ANY (ARRAY['onboarding'::"text", 'behavioral'::"text"])))
);


--
-- Name: user_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_services" (
    "user_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_watchlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entity_id" "uuid"
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "department" "public"."department" DEFAULT '기타'::"public"."department" NOT NULL,
    "team" "text" DEFAULT ''::"text" NOT NULL,
    "position" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_filter_mode" "text" DEFAULT 'all'::"text" NOT NULL,
    "feed_onboarding_skipped" boolean DEFAULT false NOT NULL,
    "approval_status" "public"."approval_status" DEFAULT 'pending'::"public"."approval_status" NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "last_seen_at" timestamp with time zone,
    "feed_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "default_lens" "text" DEFAULT 'all'::"text" NOT NULL,
    "has_password" boolean DEFAULT false NOT NULL,
    "team_name" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "users_content_filter_mode_check" CHECK (("content_filter_mode" = ANY (ARRAY['my_services'::"text", 'all'::"text"]))),
    CONSTRAINT "users_default_lens_check" CHECK (("default_lens" = ANY (ARRAY['mine'::"text", 'watch'::"text", 'all'::"text"])))
);


--
-- Name: COLUMN "users"."has_password"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."has_password" IS '340 — auth.users.encrypted_password 미러. 트리거가 유지한다. 앱에서 직접 쓰지 말 것.';


--
-- Name: weekly_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."weekly_flows" (
    "week_of" "date" NOT NULL,
    "rank" smallint DEFAULT 1 NOT NULL,
    "headline" "text",
    "flow" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: youtube_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."youtube_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid",
    "video_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "channel_name" "text" NOT NULL,
    "channel_id" "text",
    "description" "text",
    "thumbnail_url" "text",
    "duration_seconds" integer,
    "view_count" integer,
    "published_at" timestamp with time zone,
    "collected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: mcp_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."mcp_audit_log_id_seq"'::"regclass");


--
-- Name: ai_reports ai_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id");


--
-- Name: archives archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archives"
    ADD CONSTRAINT "archives_pkey" PRIMARY KEY ("id");


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id");


--
-- Name: briefings briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."briefings"
    ADD CONSTRAINT "briefings_pkey" PRIMARY KEY ("id");


--
-- Name: company_documents company_documents_dart_rcept_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_dart_rcept_no_key" UNIQUE ("dart_rcept_no");


--
-- Name: company_documents company_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_pkey" PRIMARY KEY ("content_id");


--
-- Name: competitor_weekly_reports competitor_weekly_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."competitor_weekly_reports"
    ADD CONSTRAINT "competitor_weekly_reports_pkey" PRIMARY KEY ("id");


--
-- Name: competitor_weekly_reports competitor_weekly_reports_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."competitor_weekly_reports"
    ADD CONSTRAINT "competitor_weekly_reports_week_start_key" UNIQUE ("week_start");


--
-- Name: competitor_weekly_settings competitor_weekly_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."competitor_weekly_settings"
    ADD CONSTRAINT "competitor_weekly_settings_pkey" PRIMARY KEY ("id");


--
-- Name: content_entities content_entities_content_id_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_entities"
    ADD CONSTRAINT "content_entities_content_id_entity_id_key" UNIQUE ("content_id", "entity_id");


--
-- Name: content_entities content_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_entities"
    ADD CONSTRAINT "content_entities_pkey" PRIMARY KEY ("id");


--
-- Name: content_keywords content_keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_keywords"
    ADD CONSTRAINT "content_keywords_pkey" PRIMARY KEY ("content_id", "keyword_id");


--
-- Name: content_services content_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_services"
    ADD CONSTRAINT "content_services_pkey" PRIMARY KEY ("content_id", "service_id");


--
-- Name: content_signals content_signals_content_id_signal_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_signals"
    ADD CONSTRAINT "content_signals_content_id_signal_type_key" UNIQUE ("content_id", "signal_type");


--
-- Name: content_signals content_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_signals"
    ADD CONSTRAINT "content_signals_pkey" PRIMARY KEY ("id");


--
-- Name: content_views content_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_views"
    ADD CONSTRAINT "content_views_pkey" PRIMARY KEY ("id");


--
-- Name: contents contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contents"
    ADD CONSTRAINT "contents_pkey" PRIMARY KEY ("id");


--
-- Name: crawl_logs crawl_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crawl_logs"
    ADD CONSTRAINT "crawl_logs_pkey" PRIMARY KEY ("id");


--
-- Name: crawl_settings crawl_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crawl_settings"
    ADD CONSTRAINT "crawl_settings_pkey" PRIMARY KEY ("id");


--
-- Name: curated_companies curated_companies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."curated_companies"
    ADD CONSTRAINT "curated_companies_name_key" UNIQUE ("name");


--
-- Name: curated_companies curated_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."curated_companies"
    ADD CONSTRAINT "curated_companies_pkey" PRIMARY KEY ("id");


--
-- Name: curated_groups curated_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."curated_groups"
    ADD CONSTRAINT "curated_groups_pkey" PRIMARY KEY ("key");


--
-- Name: daily_insights daily_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."daily_insights"
    ADD CONSTRAINT "daily_insights_pkey" PRIMARY KEY ("id");


--
-- Name: document_sources document_sources_entity_id_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."document_sources"
    ADD CONSTRAINT "document_sources_entity_id_url_key" UNIQUE ("entity_id", "url");


--
-- Name: document_sources document_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."document_sources"
    ADD CONSTRAINT "document_sources_pkey" PRIMARY KEY ("id");


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_pkey" PRIMARY KEY ("id");


--
-- Name: entity_aliases entity_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: entity_dart_map entity_dart_map_corp_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_dart_map"
    ADD CONSTRAINT "entity_dart_map_corp_code_key" UNIQUE ("corp_code");


--
-- Name: entity_dart_map entity_dart_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_dart_map"
    ADD CONSTRAINT "entity_dart_map_pkey" PRIMARY KEY ("entity_id");


--
-- Name: entity_events entity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_events"
    ADD CONSTRAINT "entity_events_pkey" PRIMARY KEY ("id");


--
-- Name: exclusion_candidate_ignores exclusion_candidate_ignores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exclusion_candidate_ignores"
    ADD CONSTRAINT "exclusion_candidate_ignores_pkey" PRIMARY KEY ("domain");


--
-- Name: exclusion_rules exclusion_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exclusion_rules"
    ADD CONSTRAINT "exclusion_rules_pkey" PRIMARY KEY ("id");


--
-- Name: homepage_sections homepage_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."homepage_sections"
    ADD CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("section_key");


--
-- Name: insight_cards insight_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insight_cards"
    ADD CONSTRAINT "insight_cards_pkey" PRIMARY KEY ("id");


--
-- Name: issue_contents issue_contents_issue_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."issue_contents"
    ADD CONSTRAINT "issue_contents_issue_id_content_id_key" UNIQUE ("issue_id", "content_id");


--
-- Name: issue_contents issue_contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."issue_contents"
    ADD CONSTRAINT "issue_contents_pkey" PRIMARY KEY ("id");


--
-- Name: issues issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_pkey" PRIMARY KEY ("id");


--
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."job_runs"
    ADD CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id");


--
-- Name: key_insights key_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."key_insights"
    ADD CONSTRAINT "key_insights_pkey" PRIMARY KEY ("id");


--
-- Name: keyword_groups keyword_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keyword_groups"
    ADD CONSTRAINT "keyword_groups_pkey" PRIMARY KEY ("id");


--
-- Name: keyword_insight_cache keyword_insight_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keyword_insight_cache"
    ADD CONSTRAINT "keyword_insight_cache_pkey" PRIMARY KEY ("id");


--
-- Name: keyword_rise_factors keyword_rise_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keyword_rise_factors"
    ADD CONSTRAINT "keyword_rise_factors_pkey" PRIMARY KEY ("keyword");


--
-- Name: keywords keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keywords"
    ADD CONSTRAINT "keywords_pkey" PRIMARY KEY ("id");


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_models"
    ADD CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id");


--
-- Name: llm_models llm_models_provider_model_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_models"
    ADD CONSTRAINT "llm_models_provider_model_id_key" UNIQUE ("provider", "model_id");


--
-- Name: llm_prompts llm_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_prompts"
    ADD CONSTRAINT "llm_prompts_pkey" PRIMARY KEY ("key");


--
-- Name: llm_settings llm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_settings"
    ADD CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("provider");


--
-- Name: llm_task_routing llm_task_routing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_task_routing"
    ADD CONSTRAINT "llm_task_routing_pkey" PRIMARY KEY ("id");


--
-- Name: llm_task_routing llm_task_routing_task_type_priority_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_task_routing"
    ADD CONSTRAINT "llm_task_routing_task_type_priority_key" UNIQUE ("task_type", "priority");


--
-- Name: llm_usage llm_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."llm_usage"
    ADD CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("provider", "period");


--
-- Name: mcp_audit_log mcp_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_audit_log"
    ADD CONSTRAINT "mcp_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: mcp_tokens mcp_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: mcp_tokens mcp_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_token_hash_key" UNIQUE ("token_hash");


--
-- Name: newsletter_issues newsletter_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_issues"
    ADD CONSTRAINT "newsletter_issues_pkey" PRIMARY KEY ("id");


--
-- Name: newsletter_recipients newsletter_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_pkey" PRIMARY KEY ("id");


--
-- Name: newsletter_settings newsletter_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_settings"
    ADD CONSTRAINT "newsletter_settings_pkey" PRIMARY KEY ("id");


--
-- Name: newsletter_subscriptions newsletter_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_subscriptions"
    ADD CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("user_id");


--
-- Name: ops_requests ops_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_requests"
    ADD CONSTRAINT "ops_requests_pkey" PRIMARY KEY ("id");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: signup_email_allowlist signup_email_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."signup_email_allowlist"
    ADD CONSTRAINT "signup_email_allowlist_pkey" PRIMARY KEY ("email");


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("id");


--
-- Name: translation_settings translation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."translation_settings"
    ADD CONSTRAINT "translation_settings_pkey" PRIMARY KEY ("provider");


--
-- Name: translation_usage translation_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."translation_usage"
    ADD CONSTRAINT "translation_usage_pkey" PRIMARY KEY ("id");


--
-- Name: translation_usage translation_usage_provider_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."translation_usage"
    ADD CONSTRAINT "translation_usage_provider_period_key" UNIQUE ("provider", "period");


--
-- Name: trending_snapshots trending_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trending_snapshots"
    ADD CONSTRAINT "trending_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: trending_snapshots trending_snapshots_snapshot_date_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trending_snapshots"
    ADD CONSTRAINT "trending_snapshots_snapshot_date_rank_key" UNIQUE ("snapshot_date", "rank");


--
-- Name: tts_usage tts_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tts_usage"
    ADD CONSTRAINT "tts_usage_pkey" PRIMARY KEY ("provider", "period");


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: user_preferences user_preferences_user_id_keyword_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_keyword_id_key" UNIQUE ("user_id", "keyword_id");


--
-- Name: user_service_prefs user_service_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_service_prefs"
    ADD CONSTRAINT "user_service_prefs_pkey" PRIMARY KEY ("id");


--
-- Name: user_service_prefs user_service_prefs_user_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_service_prefs"
    ADD CONSTRAINT "user_service_prefs_user_id_service_id_key" UNIQUE ("user_id", "service_id");


--
-- Name: user_services user_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_services"
    ADD CONSTRAINT "user_services_pkey" PRIMARY KEY ("user_id", "service_id");


--
-- Name: user_watchlist user_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_watchlist"
    ADD CONSTRAINT "user_watchlist_pkey" PRIMARY KEY ("id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: weekly_flows weekly_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."weekly_flows"
    ADD CONSTRAINT "weekly_flows_pkey" PRIMARY KEY ("week_of", "rank");


--
-- Name: youtube_videos youtube_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."youtube_videos"
    ADD CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id");


--
-- Name: ai_report_sources_content_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_report_sources_content_key" ON "public"."ai_report_sources" USING "btree" ("ai_report_id", "content_id") WHERE ("content_id" IS NOT NULL);


--
-- Name: ai_report_sources_issue_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_report_sources_issue_key" ON "public"."ai_report_sources" USING "btree" ("ai_report_id", "issue_id") WHERE ("issue_id" IS NOT NULL);


--
-- Name: ai_report_sources_youtube_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_report_sources_youtube_key" ON "public"."ai_report_sources" USING "btree" ("ai_report_id", "youtube_video_id") WHERE ("youtube_video_id" IS NOT NULL);


--
-- Name: ai_reports_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_reports_published_at_idx" ON "public"."ai_reports" USING "btree" ("published_at" DESC) WHERE ("published_at" IS NOT NULL);


--
-- Name: ai_reports_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_reports_user_idx" ON "public"."ai_reports" USING "btree" ("user_id");


--
-- Name: archive_items_content_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "archive_items_content_key" ON "public"."archive_items" USING "btree" ("archive_id", "content_id") WHERE ("content_id" IS NOT NULL);


--
-- Name: archive_items_youtube_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "archive_items_youtube_key" ON "public"."archive_items" USING "btree" ("archive_id", "youtube_video_id") WHERE ("youtube_video_id" IS NOT NULL);


--
-- Name: archive_items_archive_report_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "archive_items_archive_report_key" ON "public"."archive_items" USING "btree" ("archive_id", "ai_report_id") WHERE ("ai_report_id" IS NOT NULL);


--
-- Name: archives_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "archives_user_idx" ON "public"."archives" USING "btree" ("user_id");


--
-- Name: bookmarks_user_content_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "bookmarks_user_content_key" ON "public"."bookmarks" USING "btree" ("user_id", "content_id") WHERE ("content_id" IS NOT NULL);


--
-- Name: bookmarks_user_youtube_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "bookmarks_user_youtube_key" ON "public"."bookmarks" USING "btree" ("user_id", "youtube_video_id") WHERE ("youtube_video_id" IS NOT NULL);


--
-- Name: bookmarks_user_report_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "bookmarks_user_report_key" ON "public"."bookmarks" USING "btree" ("user_id", "ai_report_id") WHERE ("ai_report_id" IS NOT NULL);


--
-- Name: briefings_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "briefings_date_key" ON "public"."briefings" USING "btree" ("briefing_date");


--
-- Name: briefings_source_content_ids_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "briefings_source_content_ids_gin" ON "public"."briefings" USING "gin" ("source_content_ids");


--
-- Name: briefings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "briefings_status_idx" ON "public"."briefings" USING "btree" ("status", "briefing_date" DESC);


--
-- Name: company_documents_entity_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_documents_entity_published_idx" ON "public"."company_documents" USING "btree" ("entity_id", "published_on" DESC);


--
-- Name: company_documents_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_documents_review_idx" ON "public"."company_documents" USING "btree" ("review_status", "created_at" DESC);


--
-- Name: content_entities_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_entities_content_idx" ON "public"."content_entities" USING "btree" ("content_id");


--
-- Name: content_entities_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_entities_entity_idx" ON "public"."content_entities" USING "btree" ("entity_id");


--
-- Name: content_keywords_keyword_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_keywords_keyword_idx" ON "public"."content_keywords" USING "btree" ("keyword_id");


--
-- Name: content_services_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_services_service_idx" ON "public"."content_services" USING "btree" ("service_id");


--
-- Name: content_signals_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_signals_content_idx" ON "public"."content_signals" USING "btree" ("content_id");


--
-- Name: content_signals_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_signals_type_idx" ON "public"."content_signals" USING "btree" ("signal_type");


--
-- Name: content_views_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_views_content_idx" ON "public"."content_views" USING "btree" ("content_id");


--
-- Name: content_views_user_viewed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "content_views_user_viewed_idx" ON "public"."content_views" USING "btree" ("user_id", "viewed_at" DESC);


--
-- Name: contents_alive_collected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_alive_collected_idx" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE ("deleted_at" IS NULL);


--
-- Name: contents_body_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_body_hash_idx" ON "public"."contents" USING "btree" ("body_hash") WHERE ("body_hash" IS NOT NULL);


--
-- Name: contents_category_collected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_category_collected_idx" ON "public"."contents" USING "btree" ("category", "collected_at" DESC);


--
-- Name: contents_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_category_idx" ON "public"."contents" USING "btree" ("category");


--
-- Name: contents_category_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_category_published_idx" ON "public"."contents" USING "btree" ("category", "published_at" DESC);


--
-- Name: contents_cluster_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_cluster_idx" ON "public"."contents" USING "btree" ("cluster_id") WHERE ("cluster_id" IS NOT NULL);


--
-- Name: contents_collected_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_collected_at_idx" ON "public"."contents" USING "btree" ("collected_at" DESC);


--
-- Name: contents_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_deleted_at_idx" ON "public"."contents" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);


--
-- Name: contents_lgu_impact_null_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_lgu_impact_null_idx" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE (("lgu_impact" IS NULL) AND ("status" = 'published'::"public"."content_status"));


--
-- Name: contents_matched_groups_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_matched_groups_idx" ON "public"."contents" USING "gin" ("matched_groups");


--
-- Name: contents_matched_keywords_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_matched_keywords_idx" ON "public"."contents" USING "gin" ("matched_keywords");


--
-- Name: contents_original_url_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "contents_original_url_key" ON "public"."contents" USING "btree" ("original_url") WHERE ("original_url" IS NOT NULL);


--
-- Name: contents_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_published_at_idx" ON "public"."contents" USING "btree" ("published_at" DESC);


--
-- Name: contents_search_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_search_vector_idx" ON "public"."contents" USING "gin" ("search_vector");


--
-- Name: contents_signals_classified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_signals_classified_idx" ON "public"."contents" USING "btree" ("signals_classified_at");


--
-- Name: contents_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_source_idx" ON "public"."contents" USING "btree" ("source_id");


--
-- Name: contents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_status_idx" ON "public"."contents" USING "btree" ("status");


--
-- Name: contents_summary_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_summary_pending_idx" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE (("status" = 'published'::"public"."content_status") AND ("summary_ko" IS NULL) AND ("summary_attempted_at" IS NULL));


--
-- Name: contents_title_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_title_hash_idx" ON "public"."contents" USING "btree" ("title_hash") WHERE ("title_hash" IS NOT NULL);


--
-- Name: contents_youtube_transcript_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contents_youtube_transcript_pending_idx" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE (("category" = '유튜브'::"public"."content_category") AND ("transcript_fetched_at" IS NULL));


--
-- Name: crawl_logs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crawl_logs_source_idx" ON "public"."crawl_logs" USING "btree" ("source_id", "created_at" DESC);


--
-- Name: curated_companies_competitor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "curated_companies_competitor_idx" ON "public"."curated_companies" USING "btree" ("is_competitor") WHERE "is_competitor";


--
-- Name: curated_companies_groups_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "curated_companies_groups_idx" ON "public"."curated_companies" USING "gin" ("groups");


--
-- Name: cwr_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cwr_week_idx" ON "public"."competitor_weekly_reports" USING "btree" ("week_start" DESC);


--
-- Name: daily_insights_day_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "daily_insights_day_status_idx" ON "public"."daily_insights" USING "btree" ("day_of" DESC, "status", "display_order");


--
-- Name: daily_insights_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "daily_insights_week_idx" ON "public"."daily_insights" USING "btree" ("week_of" DESC, "display_order");


--
-- Name: document_sources_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_sources_entity_idx" ON "public"."document_sources" USING "btree" ("entity_id", "is_active");


--
-- Name: entities_canonical_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "entities_canonical_type_key" ON "public"."entities" USING "btree" ("lower"("canonical_name"), "entity_type");


--
-- Name: entities_competitor_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entities_competitor_group_idx" ON "public"."entities" USING "btree" ("competitor_group") WHERE ("competitor_group" IS NOT NULL);


--
-- Name: entities_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entities_type_idx" ON "public"."entities" USING "btree" ("entity_type");


--
-- Name: entity_aliases_alias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "entity_aliases_alias_key" ON "public"."entity_aliases" USING "btree" ("lower"("alias"));


--
-- Name: entity_aliases_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entity_aliases_entity_idx" ON "public"."entity_aliases" USING "btree" ("entity_id");


--
-- Name: entity_events_entity_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entity_events_entity_date_idx" ON "public"."entity_events" USING "btree" ("entity_id", "event_date" DESC);


--
-- Name: idx_ars_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ars_issue" ON "public"."ai_report_sources" USING "btree" ("issue_id");


--
-- Name: idx_contents_body_len; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contents_body_len" ON "public"."contents" USING "btree" ("body_len");


--
-- Name: idx_contents_canonical_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contents_canonical_url" ON "public"."contents" USING "btree" ("canonical_url") WHERE ("canonical_url" IS NOT NULL);


--
-- Name: idx_contents_cluster_recheck; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contents_cluster_recheck" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE (("category" = '뉴스'::"public"."content_category") AND ("cluster_checked_at" IS NULL));


--
-- Name: idx_contents_thumb_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contents_thumb_retry" ON "public"."contents" USING "btree" ("collected_at" DESC) WHERE (("thumbnail_url" IS NULL) AND ("thumbnail_fetched_at" IS NULL) AND ("original_url" IS NOT NULL));


--
-- Name: idx_daily_insights_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_daily_insights_day" ON "public"."daily_insights" USING "btree" ("day_of");


--
-- Name: idx_daily_insights_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_daily_insights_review" ON "public"."daily_insights" USING "btree" ("needs_review") WHERE "needs_review";


--
-- Name: idx_daily_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_daily_insights_status" ON "public"."daily_insights" USING "btree" ("status");


--
-- Name: idx_exclusion_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exclusion_rules_active" ON "public"."exclusion_rules" USING "btree" ("is_active", "rule_type");


--
-- Name: idx_key_insights_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_key_insights_featured" ON "public"."key_insights" USING "btree" ("is_featured") WHERE "is_featured";


--
-- Name: idx_key_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_key_insights_status" ON "public"."key_insights" USING "btree" ("status");


--
-- Name: idx_key_insights_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_key_insights_week" ON "public"."key_insights" USING "btree" ("week_of");


--
-- Name: idx_keyword_insight_cache_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_keyword_insight_cache_entity" ON "public"."keyword_insight_cache" USING "btree" ("entity_id");


--
-- Name: idx_mcp_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_mcp_audit_created" ON "public"."mcp_audit_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_mcp_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_mcp_audit_user" ON "public"."mcp_audit_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_mcp_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_mcp_tokens_active" ON "public"."mcp_tokens" USING "btree" ("token_hash") WHERE ("revoked_at" IS NULL);


--
-- Name: idx_mcp_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_mcp_tokens_user" ON "public"."mcp_tokens" USING "btree" ("user_id");


--
-- Name: idx_ops_requests_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ops_requests_owner" ON "public"."ops_requests" USING "btree" ("owner");


--
-- Name: idx_ops_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ops_requests_status" ON "public"."ops_requests" USING "btree" ("post_type", "status", "updated_at" DESC);


--
-- Name: idx_ops_requests_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ops_requests_work" ON "public"."ops_requests" USING "btree" ("post_type", "phase", "seq");


--
-- Name: idx_users_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_approval_status" ON "public"."users" USING "btree" ("approval_status");


--
-- Name: insight_cards_period_scope_topic_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "insight_cards_period_scope_topic_key" ON "public"."insight_cards" USING "btree" ("period_start", "scope", "topic");


--
-- Name: insight_cards_source_content_ids_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "insight_cards_source_content_ids_gin" ON "public"."insight_cards" USING "gin" ("source_content_ids");


--
-- Name: insight_cards_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "insight_cards_status_idx" ON "public"."insight_cards" USING "btree" ("status", "period_start" DESC);


--
-- Name: issue_contents_content_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "issue_contents_content_idx" ON "public"."issue_contents" USING "btree" ("content_id");


--
-- Name: issue_contents_issue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "issue_contents_issue_idx" ON "public"."issue_contents" USING "btree" ("issue_id");


--
-- Name: issues_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "issues_status_idx" ON "public"."issues" USING "btree" ("status");


--
-- Name: job_runs_failed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "job_runs_failed_idx" ON "public"."job_runs" USING "btree" ("started_at" DESC) WHERE ("status" = 'failed'::"text");


--
-- Name: job_runs_key_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "job_runs_key_started_idx" ON "public"."job_runs" USING "btree" ("job_key", "started_at" DESC);


--
-- Name: job_runs_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "job_runs_started_idx" ON "public"."job_runs" USING "btree" ("started_at" DESC);


--
-- Name: keywords_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "keywords_name_key" ON "public"."keywords" USING "btree" ("lower"("name"));


--
-- Name: newsletter_recipients_issue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "newsletter_recipients_issue_idx" ON "public"."newsletter_recipients" USING "btree" ("issue_id");


--
-- Name: newsletter_recipients_msgid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "newsletter_recipients_msgid_idx" ON "public"."newsletter_recipients" USING "btree" ("message_id") WHERE ("message_id" IS NOT NULL);


--
-- Name: newsletter_subscriptions_unsub_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "newsletter_subscriptions_unsub_token_idx" ON "public"."newsletter_subscriptions" USING "btree" ("unsubscribe_token");


--
-- Name: sources_group_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sources_group_name_idx" ON "public"."sources" USING "btree" ("group_name");


--
-- Name: sources_rss_url_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "sources_rss_url_key" ON "public"."sources" USING "btree" ("rss_url") WHERE ("rss_url" IS NOT NULL);


--
-- Name: trending_snapshots_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trending_snapshots_date_idx" ON "public"."trending_snapshots" USING "btree" ("snapshot_date" DESC, "rank");


--
-- Name: uq_exclusion_rules_type_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_exclusion_rules_type_value" ON "public"."exclusion_rules" USING "btree" ("rule_type", "lower"("value"));


--
-- Name: user_preferences_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_preferences_user_idx" ON "public"."user_preferences" USING "btree" ("user_id");


--
-- Name: user_watchlist_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_watchlist_entity_idx" ON "public"."user_watchlist" USING "btree" ("entity_id") WHERE ("entity_id" IS NOT NULL);


--
-- Name: user_watchlist_user_company_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_watchlist_user_company_key" ON "public"."user_watchlist" USING "btree" ("user_id", "lower"("company"));


--
-- Name: user_watchlist_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_watchlist_user_idx" ON "public"."user_watchlist" USING "btree" ("user_id");


--
-- Name: youtube_videos_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "youtube_videos_published_at_idx" ON "public"."youtube_videos" USING "btree" ("published_at" DESC);


--
-- Name: youtube_videos_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "youtube_videos_source_idx" ON "public"."youtube_videos" USING "btree" ("source_id");


--
-- Name: youtube_videos_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "youtube_videos_title_trgm_idx" ON "public"."youtube_videos" USING "gin" ("title" "extensions"."gin_trgm_ops");


--
-- Name: youtube_videos_video_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "youtube_videos_video_id_key" ON "public"."youtube_videos" USING "btree" ("video_id");


--
-- Name: issue_evidence _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."issue_evidence" AS
 SELECT "ic"."issue_id",
    "c"."id" AS "content_id",
    "c"."title",
    "c"."summary_ko",
    "c"."original_url",
    "c"."thumbnail_url",
    ("c"."category")::"text" AS "category",
    "c"."published_at",
    "s"."name" AS "source_name",
    "array_agg"(DISTINCT ("cs"."signal_type")::"text") AS "signal_types",
    "max"("cs"."score") AS "max_signal_score",
    "count"("cs"."id") AS "signal_count"
   FROM ((("public"."issue_contents" "ic"
     JOIN "public"."contents" "c" ON (("c"."id" = "ic"."content_id")))
     LEFT JOIN "public"."sources" "s" ON (("s"."id" = "c"."source_id")))
     JOIN "public"."content_signals" "cs" ON (("cs"."content_id" = "c"."id")))
  GROUP BY "ic"."issue_id", "c"."id", "s"."name";


--
-- Name: contents contents_search_vector_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "contents_search_vector_trigger" BEFORE INSERT OR UPDATE ON "public"."contents" FOR EACH ROW EXECUTE FUNCTION "public"."contents_search_vector_update"();


--
-- Name: ai_reports set_ai_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_ai_reports_updated_at" BEFORE UPDATE ON "public"."ai_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: archives set_archives_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_archives_updated_at" BEFORE UPDATE ON "public"."archives" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: briefings set_briefings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_briefings_updated_at" BEFORE UPDATE ON "public"."briefings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: company_documents set_company_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_company_documents_updated_at" BEFORE UPDATE ON "public"."company_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: contents set_contents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_contents_updated_at" BEFORE UPDATE ON "public"."contents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: daily_insights set_daily_insights_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_daily_insights_updated_at" BEFORE UPDATE ON "public"."daily_insights" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: document_sources set_document_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_document_sources_updated_at" BEFORE UPDATE ON "public"."document_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: entities set_entities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_entities_updated_at" BEFORE UPDATE ON "public"."entities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: entity_dart_map set_entity_dart_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_entity_dart_map_updated_at" BEFORE UPDATE ON "public"."entity_dart_map" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: insight_cards set_insight_cards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_insight_cards_updated_at" BEFORE UPDATE ON "public"."insight_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: issues set_issues_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_issues_updated_at" BEFORE UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: key_insights set_key_insights_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_key_insights_updated_at" BEFORE UPDATE ON "public"."key_insights" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: keyword_groups set_keyword_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_keyword_groups_updated_at" BEFORE UPDATE ON "public"."keyword_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: keyword_rise_factors set_keyword_rise_factors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_keyword_rise_factors_updated_at" BEFORE UPDATE ON "public"."keyword_rise_factors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: newsletter_settings set_newsletter_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_newsletter_settings_updated_at" BEFORE UPDATE ON "public"."newsletter_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: newsletter_subscriptions set_newsletter_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_newsletter_subscriptions_updated_at" BEFORE UPDATE ON "public"."newsletter_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: sources set_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_sources_updated_at" BEFORE UPDATE ON "public"."sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_preferences set_user_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_service_prefs set_user_service_prefs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_user_service_prefs_updated_at" BEFORE UPDATE ON "public"."user_service_prefs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: users set_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: youtube_videos set_youtube_videos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "set_youtube_videos_updated_at" BEFORE UPDATE ON "public"."youtube_videos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: bookmarks sync_bookmark_count_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "sync_bookmark_count_del" AFTER DELETE ON "public"."bookmarks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_content_bookmark_count"();


--
-- Name: bookmarks sync_bookmark_count_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "sync_bookmark_count_ins" AFTER INSERT ON "public"."bookmarks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_content_bookmark_count"();


--
-- Name: competitor_weekly_settings trg_competitor_weekly_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_competitor_weekly_settings_updated_at" BEFORE UPDATE ON "public"."competitor_weekly_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: crawl_settings trg_crawl_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_crawl_settings_updated_at" BEFORE UPDATE ON "public"."crawl_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: homepage_sections trg_homepage_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_homepage_sections_updated_at" BEFORE UPDATE ON "public"."homepage_sections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: users trg_lock_approval_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_lock_approval_columns" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."lock_approval_columns"();


--
-- Name: ops_requests trg_ops_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_ops_requests_updated_at" BEFORE UPDATE ON "public"."ops_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_ops_requests_updated_at"();


--
-- Name: ai_report_sources ai_report_sources_ai_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_report_sources"
    ADD CONSTRAINT "ai_report_sources_ai_report_id_fkey" FOREIGN KEY ("ai_report_id") REFERENCES "public"."ai_reports"("id") ON DELETE CASCADE;


--
-- Name: ai_report_sources ai_report_sources_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_report_sources"
    ADD CONSTRAINT "ai_report_sources_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: ai_report_sources ai_report_sources_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_report_sources"
    ADD CONSTRAINT "ai_report_sources_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;


--
-- Name: ai_report_sources ai_report_sources_youtube_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_report_sources"
    ADD CONSTRAINT "ai_report_sources_youtube_video_id_fkey" FOREIGN KEY ("youtube_video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE CASCADE;


--
-- Name: ai_reports ai_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: archive_items archive_items_archive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archive_items"
    ADD CONSTRAINT "archive_items_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archives"("id") ON DELETE CASCADE;


--
-- Name: archive_items archive_items_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archive_items"
    ADD CONSTRAINT "archive_items_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: archive_items archive_items_youtube_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archive_items"
    ADD CONSTRAINT "archive_items_youtube_video_id_fkey" FOREIGN KEY ("youtube_video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE CASCADE;


--
-- Name: archive_items archive_items_ai_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archive_items"
    ADD CONSTRAINT "archive_items_ai_report_id_fkey" FOREIGN KEY ("ai_report_id") REFERENCES "public"."ai_reports"("id") ON DELETE CASCADE;


--
-- Name: archives archives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."archives"
    ADD CONSTRAINT "archives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_ai_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_ai_report_id_fkey" FOREIGN KEY ("ai_report_id") REFERENCES "public"."ai_reports"("id") ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_youtube_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_youtube_video_id_fkey" FOREIGN KEY ("youtube_video_id") REFERENCES "public"."youtube_videos"("id") ON DELETE CASCADE;


--
-- Name: company_documents company_documents_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: company_documents company_documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE SET NULL;


--
-- Name: company_documents company_documents_prev_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_prev_content_id_fkey" FOREIGN KEY ("prev_content_id") REFERENCES "public"."contents"("id") ON DELETE SET NULL;


--
-- Name: content_entities content_entities_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_entities"
    ADD CONSTRAINT "content_entities_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: content_entities content_entities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_entities"
    ADD CONSTRAINT "content_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: content_keywords content_keywords_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_keywords"
    ADD CONSTRAINT "content_keywords_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: content_keywords content_keywords_keyword_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_keywords"
    ADD CONSTRAINT "content_keywords_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE CASCADE;


--
-- Name: content_services content_services_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_services"
    ADD CONSTRAINT "content_services_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: content_services content_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_services"
    ADD CONSTRAINT "content_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;


--
-- Name: content_signals content_signals_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_signals"
    ADD CONSTRAINT "content_signals_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: content_views content_views_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_views"
    ADD CONSTRAINT "content_views_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: content_views content_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."content_views"
    ADD CONSTRAINT "content_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: contents contents_cluster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contents"
    ADD CONSTRAINT "contents_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "public"."contents"("id") ON DELETE SET NULL;


--
-- Name: contents contents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contents"
    ADD CONSTRAINT "contents_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: contents contents_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contents"
    ADD CONSTRAINT "contents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE SET NULL;


--
-- Name: crawl_logs crawl_logs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crawl_logs"
    ADD CONSTRAINT "crawl_logs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE SET NULL;


--
-- Name: curated_companies curated_companies_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."curated_companies"
    ADD CONSTRAINT "curated_companies_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE SET NULL;


--
-- Name: document_sources document_sources_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."document_sources"
    ADD CONSTRAINT "document_sources_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: entities entities_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."entities"("id") ON DELETE SET NULL;


--
-- Name: entities entities_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;


--
-- Name: entity_aliases entity_aliases_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: entity_dart_map entity_dart_map_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_dart_map"
    ADD CONSTRAINT "entity_dart_map_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: entity_events entity_events_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entity_events"
    ADD CONSTRAINT "entity_events_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: issue_contents issue_contents_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."issue_contents"
    ADD CONSTRAINT "issue_contents_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE CASCADE;


--
-- Name: issue_contents issue_contents_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."issue_contents"
    ADD CONSTRAINT "issue_contents_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;


--
-- Name: job_runs job_runs_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."job_runs"
    ADD CONSTRAINT "job_runs_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: key_insights key_insights_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."key_insights"
    ADD CONSTRAINT "key_insights_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;


--
-- Name: keyword_insight_cache keyword_insight_cache_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keyword_insight_cache"
    ADD CONSTRAINT "keyword_insight_cache_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;


--
-- Name: keywords keywords_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."keywords"
    ADD CONSTRAINT "keywords_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;


--
-- Name: mcp_audit_log mcp_audit_log_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_audit_log"
    ADD CONSTRAINT "mcp_audit_log_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE SET NULL;


--
-- Name: mcp_audit_log mcp_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_audit_log"
    ADD CONSTRAINT "mcp_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: mcp_tokens mcp_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: mcp_tokens mcp_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: newsletter_recipients newsletter_recipients_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE CASCADE;


--
-- Name: newsletter_recipients newsletter_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: newsletter_subscriptions newsletter_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."newsletter_subscriptions"
    ADD CONSTRAINT "newsletter_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: trending_snapshots trending_snapshots_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trending_snapshots"
    ADD CONSTRAINT "trending_snapshots_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE SET NULL;


--
-- Name: trending_snapshots trending_snapshots_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trending_snapshots"
    ADD CONSTRAINT "trending_snapshots_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_keyword_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_service_prefs user_service_prefs_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_service_prefs"
    ADD CONSTRAINT "user_service_prefs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;


--
-- Name: user_service_prefs user_service_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_service_prefs"
    ADD CONSTRAINT "user_service_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_services user_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_services"
    ADD CONSTRAINT "user_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;


--
-- Name: user_services user_services_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_services"
    ADD CONSTRAINT "user_services_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_watchlist user_watchlist_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_watchlist"
    ADD CONSTRAINT "user_watchlist_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE SET NULL;


--
-- Name: user_watchlist user_watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_watchlist"
    ADD CONSTRAINT "user_watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: users users_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: youtube_videos youtube_videos_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."youtube_videos"
    ADD CONSTRAINT "youtube_videos_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE SET NULL;


--
-- Name: ai_report_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_report_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_report_sources ai_report_sources: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_report_sources: 본인 삭제" ON "public"."ai_report_sources" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ai_reports" "r"
  WHERE (("r"."id" = "ai_report_sources"."ai_report_id") AND ("r"."user_id" = "auth"."uid"())))));


--
-- Name: ai_report_sources ai_report_sources: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_report_sources: 본인 조회" ON "public"."ai_report_sources" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ai_reports" "r"
  WHERE (("r"."id" = "ai_report_sources"."ai_report_id") AND ("r"."user_id" = "auth"."uid"())))));


--
-- Name: ai_report_sources ai_report_sources: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_report_sources: 본인 추가" ON "public"."ai_report_sources" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ai_reports" "r"
  WHERE (("r"."id" = "ai_report_sources"."ai_report_id") AND ("r"."user_id" = "auth"."uid"())))));


--
-- Name: ai_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_reports ai_reports: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_reports: admin 전체 조회" ON "public"."ai_reports" FOR SELECT USING ("public"."is_admin"());


--
-- Name: ai_reports ai_reports: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_reports: 본인 삭제" ON "public"."ai_reports" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_reports ai_reports: 본인 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_reports: 본인 수정" ON "public"."ai_reports" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ai_reports ai_reports: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_reports: 본인 조회" ON "public"."ai_reports" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_reports ai_reports: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_reports: 본인 추가" ON "public"."ai_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: archive_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."archive_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: archive_items archive_items: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archive_items: 본인 삭제" ON "public"."archive_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "archive_items"."archive_id") AND ("a"."user_id" = "auth"."uid"())))));


--
-- Name: archive_items archive_items: 본인 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archive_items: 본인 수정" ON "public"."archive_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "archive_items"."archive_id") AND ("a"."user_id" = "auth"."uid"())))));


--
-- Name: archive_items archive_items: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archive_items: 본인 조회" ON "public"."archive_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "archive_items"."archive_id") AND ("a"."user_id" = "auth"."uid"())))));


--
-- Name: archive_items archive_items: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archive_items: 본인 추가" ON "public"."archive_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "archive_items"."archive_id") AND ("a"."user_id" = "auth"."uid"())))));


--
-- Name: archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."archives" ENABLE ROW LEVEL SECURITY;

--
-- Name: archives archives: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archives: 본인 삭제" ON "public"."archives" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: archives archives: 본인 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archives: 본인 수정" ON "public"."archives" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: archives archives: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archives: 본인 조회" ON "public"."archives" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: archives archives: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "archives: 본인 추가" ON "public"."archives" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;

--
-- Name: bookmarks bookmarks: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookmarks: 본인 삭제" ON "public"."bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: bookmarks bookmarks: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookmarks: 본인 조회" ON "public"."bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: bookmarks bookmarks: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookmarks: 본인 추가" ON "public"."bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: briefings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."briefings" ENABLE ROW LEVEL SECURITY;

--
-- Name: briefings briefings: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "briefings: admin 관리" ON "public"."briefings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: briefings briefings: 인증 사용자 공개분 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "briefings: 인증 사용자 공개분 조회" ON "public"."briefings" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("status" = ANY (ARRAY['published'::"public"."briefing_status", 'archived'::"public"."briefing_status"]))));


--
-- Name: company_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."company_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: company_documents company_documents: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "company_documents: 인증 조회" ON "public"."company_documents" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: competitor_weekly_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."competitor_weekly_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: competitor_weekly_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."competitor_weekly_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."content_entities" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_entities content_entities: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_entities: admin 전체" ON "public"."content_entities" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: content_entities content_entities: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_entities: 인증 조회" ON "public"."content_entities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: content_keywords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."content_keywords" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_keywords content_keywords: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_keywords: admin 관리" ON "public"."content_keywords" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: content_keywords content_keywords: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_keywords: 인증 사용자 조회" ON "public"."content_keywords" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: content_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."content_services" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_services content_services: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_services: admin 관리" ON "public"."content_services" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: content_services content_services: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_services: 인증 사용자 조회" ON "public"."content_services" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: content_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."content_signals" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_signals content_signals: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_signals: admin 전체" ON "public"."content_signals" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: content_signals content_signals: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "content_signals: 인증 조회" ON "public"."content_signals" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: content_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."content_views" ENABLE ROW LEVEL SECURITY;

--
-- Name: contents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contents" ENABLE ROW LEVEL SECURITY;

--
-- Name: contents contents: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contents: admin 관리" ON "public"."contents" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: contents contents: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contents: admin 전체 조회" ON "public"."contents" FOR SELECT USING ("public"."is_admin"());


--
-- Name: contents contents: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contents: 인증 사용자 조회" ON "public"."contents" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("status" = 'published'::"public"."content_status")));

CREATE POLICY "contents: 익명 공개 조회(뉴스레터)" ON "public"."contents" FOR SELECT TO "anon" USING (("status" = 'published'::"public"."content_status"));


--
-- Name: crawl_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."crawl_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: crawl_logs crawl_logs: admin 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crawl_logs: admin 조회" ON "public"."crawl_logs" FOR SELECT USING ("public"."is_admin"());


--
-- Name: crawl_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."crawl_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: crawl_settings crawl_settings admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crawl_settings admin write" ON "public"."crawl_settings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: crawl_settings crawl_settings read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crawl_settings read all" ON "public"."crawl_settings" FOR SELECT USING (true);


--
-- Name: curated_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."curated_companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: curated_companies curated_companies read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "curated_companies read" ON "public"."curated_companies" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: curated_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."curated_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: curated_groups curated_groups read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "curated_groups read" ON "public"."curated_groups" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: competitor_weekly_reports cwr: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cwr: admin 전체" ON "public"."competitor_weekly_reports" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: competitor_weekly_reports cwr: 인증 조회(published); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cwr: 인증 조회(published)" ON "public"."competitor_weekly_reports" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = 'published'::"text")));


--
-- Name: daily_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."daily_insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_insights daily_insights: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_insights: admin 관리" ON "public"."daily_insights" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: daily_insights daily_insights: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_insights: admin 전체 조회" ON "public"."daily_insights" FOR SELECT USING ("public"."is_admin"());


--
-- Name: daily_insights daily_insights: 인증 사용자 published 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_insights: 인증 사용자 published 조회" ON "public"."daily_insights" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("status" = 'published'::"text")));

CREATE POLICY "daily_insights: 익명 공개 조회(뉴스레터)" ON "public"."daily_insights" FOR SELECT TO "anon" USING (("status" = 'published'::"text"));


--
-- Name: document_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."document_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_sources document_sources: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "document_sources: 인증 조회" ON "public"."document_sources" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."entities" ENABLE ROW LEVEL SECURITY;

--
-- Name: entities entities: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entities: admin 전체" ON "public"."entities" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: entities entities: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entities: 인증 조회" ON "public"."entities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: entity_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."entity_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_aliases entity_aliases: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entity_aliases: admin 전체" ON "public"."entity_aliases" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: entity_aliases entity_aliases: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entity_aliases: 인증 조회" ON "public"."entity_aliases" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: entity_dart_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."entity_dart_map" ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_dart_map entity_dart_map: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entity_dart_map: 인증 조회" ON "public"."entity_dart_map" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: entity_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."entity_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_events entity_events: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entity_events: admin 관리" ON "public"."entity_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: entity_events entity_events: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "entity_events: 인증 조회" ON "public"."entity_events" FOR SELECT TO "authenticated" USING (true);


--
-- Name: exclusion_candidate_ignores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exclusion_candidate_ignores" ENABLE ROW LEVEL SECURITY;

--
-- Name: exclusion_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exclusion_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."homepage_sections" ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sections homepage_sections admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "homepage_sections admin write" ON "public"."homepage_sections" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: homepage_sections homepage_sections read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "homepage_sections read all" ON "public"."homepage_sections" FOR SELECT USING (true);


--
-- Name: insight_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."insight_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: insight_cards insight_cards: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insight_cards: admin 관리" ON "public"."insight_cards" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: insight_cards insight_cards: 인증 사용자 published 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insight_cards: 인증 사용자 published 조회" ON "public"."insight_cards" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("status" = ANY (ARRAY['published'::"public"."insight_card_status", 'archived'::"public"."insight_card_status"]))));


--
-- Name: issue_contents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."issue_contents" ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_contents issue_contents: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "issue_contents: admin 전체" ON "public"."issue_contents" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: issue_contents issue_contents: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "issue_contents: 인증 조회" ON "public"."issue_contents" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."issues" ENABLE ROW LEVEL SECURITY;

--
-- Name: issues issues: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "issues: admin 전체" ON "public"."issues" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: issues issues: 인증 published 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "issues: 인증 published 조회" ON "public"."issues" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = ANY (ARRAY['published'::"public"."issue_status", 'archived'::"public"."issue_status"]))));


--
-- Name: job_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."job_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: key_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."key_insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: key_insights key_insights: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "key_insights: admin 관리" ON "public"."key_insights" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: key_insights key_insights: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "key_insights: admin 전체 조회" ON "public"."key_insights" FOR SELECT USING ("public"."is_admin"());


--
-- Name: key_insights key_insights: 인증 사용자 published 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "key_insights: 인증 사용자 published 조회" ON "public"."key_insights" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("status" = 'published'::"text")));


--
-- Name: keyword_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."keyword_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: keyword_groups keyword_groups: admin 전체; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keyword_groups: admin 전체" ON "public"."keyword_groups" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: keyword_groups keyword_groups: 인증 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keyword_groups: 인증 조회" ON "public"."keyword_groups" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: keyword_insight_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."keyword_insight_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: keyword_insight_cache keyword_insight_cache: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keyword_insight_cache: admin 관리" ON "public"."keyword_insight_cache" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: keyword_insight_cache keyword_insight_cache: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keyword_insight_cache: 인증 사용자 조회" ON "public"."keyword_insight_cache" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: keyword_rise_factors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."keyword_rise_factors" ENABLE ROW LEVEL SECURITY;

--
-- Name: keyword_rise_factors keyword_rise_factors: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keyword_rise_factors: 인증 사용자 조회" ON "public"."keyword_rise_factors" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: keywords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."keywords" ENABLE ROW LEVEL SECURITY;

--
-- Name: keywords keywords: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keywords: admin 관리" ON "public"."keywords" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: keywords keywords: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "keywords: 인증 사용자 조회" ON "public"."keywords" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: llm_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."llm_models" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_models llm_models admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "llm_models admin" ON "public"."llm_models" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: llm_prompts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."llm_prompts" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_prompts llm_prompts read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "llm_prompts read" ON "public"."llm_prompts" FOR SELECT TO "authenticated" USING (true);


--
-- Name: llm_task_routing llm_routing admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "llm_routing admin" ON "public"."llm_task_routing" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: llm_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."llm_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_settings llm_settings admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "llm_settings admin" ON "public"."llm_settings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: llm_task_routing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."llm_task_routing" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."llm_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_usage llm_usage admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "llm_usage admin" ON "public"."llm_usage" FOR SELECT USING ("public"."is_admin"());


--
-- Name: mcp_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mcp_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mcp_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_subscriptions newsletter: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "newsletter: admin 전체 조회" ON "public"."newsletter_subscriptions" FOR SELECT USING ("public"."is_admin"());


--
-- Name: newsletter_subscriptions newsletter: 본인 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "newsletter: 본인 수정" ON "public"."newsletter_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: newsletter_subscriptions newsletter: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "newsletter: 본인 조회" ON "public"."newsletter_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: newsletter_subscriptions newsletter: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "newsletter: 본인 추가" ON "public"."newsletter_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: newsletter_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."newsletter_issues" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."newsletter_recipients" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."newsletter_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."newsletter_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_issues nl_issues: admin 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nl_issues: admin 조회" ON "public"."newsletter_issues" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: newsletter_recipients nl_recipients: admin 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nl_recipients: admin 조회" ON "public"."newsletter_recipients" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: newsletter_settings nl_settings: admin 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nl_settings: admin 수정" ON "public"."newsletter_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: newsletter_settings nl_settings: admin 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nl_settings: admin 조회" ON "public"."newsletter_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: ops_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: content_views own_content_views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own_content_views" ON "public"."content_views" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_preferences own_user_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own_user_preferences" ON "public"."user_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_service_prefs own_user_service_prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own_user_service_prefs" ON "public"."user_service_prefs" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: translation_usage read usage for authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read usage for authenticated" ON "public"."translation_usage" FOR SELECT TO "authenticated" USING (true);


--
-- Name: translation_usage service_role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role full access" ON "public"."translation_usage" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: services services: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "services: admin 관리" ON "public"."services" USING ("public"."is_admin"());


--
-- Name: services services: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "services: 인증 사용자 조회" ON "public"."services" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: signup_email_allowlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."signup_email_allowlist" ENABLE ROW LEVEL SECURITY;

--
-- Name: sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: sources sources: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sources: admin 관리" ON "public"."sources" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: sources sources: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sources: 인증 사용자 조회" ON "public"."sources" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "sources: 익명 공개 조회(뉴스레터)" ON "public"."sources" FOR SELECT TO "anon" USING (true);


--
-- Name: translation_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."translation_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: translation_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."translation_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: trending_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trending_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: trending_snapshots trending_snapshots: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trending_snapshots: admin 관리" ON "public"."trending_snapshots" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: trending_snapshots trending_snapshots: 조회는 누구나; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trending_snapshots: 조회는 누구나" ON "public"."trending_snapshots" FOR SELECT USING (true);


--
-- Name: tts_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tts_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_service_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_service_prefs" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_services" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_services user_services: 본인 삭제; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_services: 본인 삭제" ON "public"."user_services" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_services user_services: 본인 수정; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_services: 본인 수정" ON "public"."user_services" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_services user_services: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_services: 본인 조회" ON "public"."user_services" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_services user_services: 본인 추가; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_services: 본인 추가" ON "public"."user_services" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_watchlist" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_watchlist user_watchlist: 본인 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_watchlist: 본인 관리" ON "public"."user_watchlist" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: users users: admin 전체 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: admin 전체 조회" ON "public"."users" FOR SELECT USING ("public"."is_admin"());


--
-- Name: users users: 본인 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: 본인 조회" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: weekly_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."weekly_flows" ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_flows weekly_flows: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "weekly_flows: admin 관리" ON "public"."weekly_flows" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: weekly_flows weekly_flows: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "weekly_flows: 인증 사용자 조회" ON "public"."weekly_flows" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: youtube_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."youtube_videos" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_videos youtube_videos: admin 관리; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "youtube_videos: admin 관리" ON "public"."youtube_videos" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: youtube_videos youtube_videos: 인증 사용자 조회; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "youtube_videos: 인증 사용자 조회" ON "public"."youtube_videos" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";


--
-- Name: TYPE "approval_status"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TYPE "public"."approval_status" TO "anon";
GRANT ALL ON TYPE "public"."approval_status" TO "authenticated";


--
-- Name: FUNCTION "contents_search_vector_update"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."contents_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."contents_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contents_search_vector_update"() TO "service_role";


--
-- Name: FUNCTION "entity_cooccurrence"("p_min_weight" integer, "p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."entity_cooccurrence"("p_min_weight" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."entity_cooccurrence"("p_min_weight" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."entity_cooccurrence"("p_min_weight" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."entity_cooccurrence"("p_min_weight" integer, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "entity_neighbors"("p_entity_id" "uuid", "p_limit" integer, "p_min_weight" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."entity_neighbors"("p_entity_id" "uuid", "p_limit" integer, "p_min_weight" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."entity_neighbors"("p_entity_id" "uuid", "p_limit" integer, "p_min_weight" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."entity_neighbors"("p_entity_id" "uuid", "p_limit" integer, "p_min_weight" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."entity_neighbors"("p_entity_id" "uuid", "p_limit" integer, "p_min_weight" integer) TO "service_role";


--
-- Name: FUNCTION "entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."entity_pair_contents"("p_a" "uuid", "p_b" "uuid", "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "exclusion_candidates"("p_days" integer, "p_min_count" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."exclusion_candidates"("p_days" integer, "p_min_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."exclusion_candidates"("p_days" integer, "p_min_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exclusion_candidates"("p_days" integer, "p_min_count" integer) TO "service_role";


--
-- Name: FUNCTION "get_recommended_feed"("p_user_id" "uuid", "p_slot" "text", "p_hashtags" "text"[], "p_limit" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_recommended_feed"("p_user_id" "uuid", "p_slot" "text", "p_hashtags" "text"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recommended_feed"("p_user_id" "uuid", "p_slot" "text", "p_hashtags" "text"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recommended_feed"("p_user_id" "uuid", "p_slot" "text", "p_hashtags" "text"[], "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_translation_usage_this_month"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_translation_usage_this_month"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_translation_usage_this_month"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_translation_usage_this_month"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "hook_restrict_signup_by_email_domain"("event" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hook_restrict_signup_by_email_domain"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hook_restrict_signup_by_email_domain"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."hook_restrict_signup_by_email_domain"("event" "jsonb") TO "supabase_auth_admin";


--
-- Name: FUNCTION "increment_exclusion_hits"("hits" "jsonb"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."increment_exclusion_hits"("hits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_exclusion_hits"("hits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_exclusion_hits"("hits" "jsonb") TO "service_role";


--
-- Name: FUNCTION "increment_llm_usage"("p_provider" "text", "p_period" "text", "p_tokens" bigint, "p_calls" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."increment_llm_usage"("p_provider" "text", "p_period" "text", "p_tokens" bigint, "p_calls" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_llm_usage"("p_provider" "text", "p_period" "text", "p_tokens" bigint, "p_calls" integer) TO "service_role";


--
-- Name: FUNCTION "increment_translation_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."increment_translation_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_translation_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_translation_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) TO "service_role";


--
-- Name: FUNCTION "increment_tts_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."increment_tts_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_tts_usage"("p_provider" "text", "p_period" "text", "p_chars" bigint) TO "service_role";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "lock_approval_columns"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."lock_approval_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_approval_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_approval_columns"() TO "service_role";


--
-- Name: FUNCTION "merge_entities"("p_source" "uuid", "p_target" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."merge_entities"("p_source" "uuid", "p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_entities"("p_source" "uuid", "p_target" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_entities"("p_source" "uuid", "p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_entities"("p_source" "uuid", "p_target" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_matched_keyword_casing"("p_name" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."resolve_matched_keyword_casing"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_matched_keyword_casing"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_matched_keyword_casing"("p_name" "text") TO "service_role";


--
-- Name: FUNCTION "set_ops_requests_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_ops_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_ops_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ops_requests_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "source_quality_stats"("p_days" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."source_quality_stats"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."source_quality_stats"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."source_quality_stats"("p_days" integer) TO "service_role";


--
-- Name: FUNCTION "sync_content_bookmark_count"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."sync_content_bookmark_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_content_bookmark_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_content_bookmark_count"() TO "service_role";


--
-- Name: FUNCTION "sync_has_password"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."sync_has_password"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_has_password"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_has_password"() TO "service_role";


--
-- Name: TABLE "ai_report_sources"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_report_sources" TO "anon";
GRANT ALL ON TABLE "public"."ai_report_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_report_sources" TO "service_role";


--
-- Name: TABLE "ai_reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_reports" TO "service_role";


--
-- Name: TABLE "archive_items"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."archive_items" TO "anon";
GRANT ALL ON TABLE "public"."archive_items" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_items" TO "service_role";


--
-- Name: TABLE "archives"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."archives" TO "anon";
GRANT ALL ON TABLE "public"."archives" TO "authenticated";
GRANT ALL ON TABLE "public"."archives" TO "service_role";


--
-- Name: TABLE "bookmarks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";


--
-- Name: TABLE "briefings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."briefings" TO "anon";
GRANT ALL ON TABLE "public"."briefings" TO "authenticated";
GRANT ALL ON TABLE "public"."briefings" TO "service_role";


--
-- Name: TABLE "company_documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."company_documents" TO "anon";
GRANT ALL ON TABLE "public"."company_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."company_documents" TO "service_role";


--
-- Name: TABLE "competitor_weekly_reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."competitor_weekly_reports" TO "anon";
GRANT ALL ON TABLE "public"."competitor_weekly_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_weekly_reports" TO "service_role";


--
-- Name: TABLE "competitor_weekly_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."competitor_weekly_settings" TO "anon";
GRANT ALL ON TABLE "public"."competitor_weekly_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_weekly_settings" TO "service_role";


--
-- Name: TABLE "content_entities"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."content_entities" TO "anon";
GRANT ALL ON TABLE "public"."content_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."content_entities" TO "service_role";


--
-- Name: TABLE "content_keywords"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."content_keywords" TO "anon";
GRANT ALL ON TABLE "public"."content_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."content_keywords" TO "service_role";


--
-- Name: TABLE "content_services"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."content_services" TO "anon";
GRANT ALL ON TABLE "public"."content_services" TO "authenticated";
GRANT ALL ON TABLE "public"."content_services" TO "service_role";


--
-- Name: TABLE "content_signals"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."content_signals" TO "anon";
GRANT ALL ON TABLE "public"."content_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."content_signals" TO "service_role";


--
-- Name: TABLE "content_views"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."content_views" TO "anon";
GRANT ALL ON TABLE "public"."content_views" TO "authenticated";
GRANT ALL ON TABLE "public"."content_views" TO "service_role";


--
-- Name: TABLE "contents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."contents" TO "anon";
GRANT ALL ON TABLE "public"."contents" TO "authenticated";
GRANT ALL ON TABLE "public"."contents" TO "service_role";


--
-- Name: TABLE "crawl_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."crawl_logs" TO "anon";
GRANT ALL ON TABLE "public"."crawl_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."crawl_logs" TO "service_role";


--
-- Name: TABLE "crawl_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."crawl_settings" TO "anon";
GRANT ALL ON TABLE "public"."crawl_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."crawl_settings" TO "service_role";


--
-- Name: TABLE "curated_companies"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."curated_companies" TO "anon";
GRANT ALL ON TABLE "public"."curated_companies" TO "authenticated";
GRANT ALL ON TABLE "public"."curated_companies" TO "service_role";


--
-- Name: TABLE "curated_groups"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."curated_groups" TO "anon";
GRANT ALL ON TABLE "public"."curated_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."curated_groups" TO "service_role";


--
-- Name: TABLE "daily_insights"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."daily_insights" TO "anon";
GRANT ALL ON TABLE "public"."daily_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_insights" TO "service_role";


--
-- Name: TABLE "document_sources"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."document_sources" TO "anon";
GRANT ALL ON TABLE "public"."document_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."document_sources" TO "service_role";


--
-- Name: TABLE "entities"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entities" TO "anon";
GRANT ALL ON TABLE "public"."entities" TO "authenticated";
GRANT ALL ON TABLE "public"."entities" TO "service_role";


--
-- Name: TABLE "entity_aliases"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entity_aliases" TO "anon";
GRANT ALL ON TABLE "public"."entity_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_aliases" TO "service_role";


--
-- Name: TABLE "entity_dart_map"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entity_dart_map" TO "anon";
GRANT ALL ON TABLE "public"."entity_dart_map" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_dart_map" TO "service_role";


--
-- Name: TABLE "entity_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entity_events" TO "anon";
GRANT ALL ON TABLE "public"."entity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_events" TO "service_role";


--
-- Name: TABLE "issue_contents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."issue_contents" TO "anon";
GRANT ALL ON TABLE "public"."issue_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_contents" TO "service_role";


--
-- Name: TABLE "issues"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."issues" TO "anon";
GRANT ALL ON TABLE "public"."issues" TO "authenticated";
GRANT ALL ON TABLE "public"."issues" TO "service_role";


--
-- Name: TABLE "entity_issues"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entity_issues" TO "anon";
GRANT ALL ON TABLE "public"."entity_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_issues" TO "service_role";


--
-- Name: TABLE "entity_signal_summary"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entity_signal_summary" TO "anon";
GRANT ALL ON TABLE "public"."entity_signal_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_signal_summary" TO "service_role";


--
-- Name: TABLE "exclusion_candidate_ignores"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exclusion_candidate_ignores" TO "anon";
GRANT ALL ON TABLE "public"."exclusion_candidate_ignores" TO "authenticated";
GRANT ALL ON TABLE "public"."exclusion_candidate_ignores" TO "service_role";


--
-- Name: TABLE "exclusion_rules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exclusion_rules" TO "anon";
GRANT ALL ON TABLE "public"."exclusion_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."exclusion_rules" TO "service_role";


--
-- Name: TABLE "homepage_sections"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."homepage_sections" TO "anon";
GRANT ALL ON TABLE "public"."homepage_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_sections" TO "service_role";


--
-- Name: TABLE "insight_cards"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."insight_cards" TO "anon";
GRANT ALL ON TABLE "public"."insight_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."insight_cards" TO "service_role";


--
-- Name: TABLE "issue_evidence"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."issue_evidence" TO "anon";
GRANT ALL ON TABLE "public"."issue_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_evidence" TO "service_role";


--
-- Name: TABLE "job_runs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."job_runs" TO "anon";
GRANT ALL ON TABLE "public"."job_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."job_runs" TO "service_role";


--
-- Name: TABLE "key_insights"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."key_insights" TO "anon";
GRANT ALL ON TABLE "public"."key_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."key_insights" TO "service_role";


--
-- Name: TABLE "keyword_groups"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."keyword_groups" TO "anon";
GRANT ALL ON TABLE "public"."keyword_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."keyword_groups" TO "service_role";


--
-- Name: TABLE "keyword_insight_cache"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."keyword_insight_cache" TO "anon";
GRANT ALL ON TABLE "public"."keyword_insight_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."keyword_insight_cache" TO "service_role";


--
-- Name: TABLE "keyword_rise_factors"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."keyword_rise_factors" TO "anon";
GRANT ALL ON TABLE "public"."keyword_rise_factors" TO "authenticated";
GRANT ALL ON TABLE "public"."keyword_rise_factors" TO "service_role";


--
-- Name: TABLE "keywords"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."keywords" TO "anon";
GRANT ALL ON TABLE "public"."keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."keywords" TO "service_role";


--
-- Name: TABLE "llm_models"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."llm_models" TO "service_role";


--
-- Name: TABLE "llm_prompts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."llm_prompts" TO "anon";
GRANT ALL ON TABLE "public"."llm_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_prompts" TO "service_role";


--
-- Name: TABLE "llm_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."llm_settings" TO "service_role";


--
-- Name: TABLE "llm_task_routing"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."llm_task_routing" TO "service_role";


--
-- Name: TABLE "llm_usage"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."llm_usage" TO "service_role";


--
-- Name: TABLE "mcp_audit_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."mcp_audit_log" TO "service_role";


--
-- Name: SEQUENCE "mcp_audit_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."mcp_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mcp_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mcp_audit_log_id_seq" TO "service_role";


--
-- Name: TABLE "mcp_tokens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."mcp_tokens" TO "service_role";


--
-- Name: TABLE "newsletter_issues"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."newsletter_issues" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_issues" TO "service_role";


--
-- Name: TABLE "newsletter_recipients"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."newsletter_recipients" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_recipients" TO "service_role";


--
-- Name: TABLE "newsletter_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."newsletter_settings" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_settings" TO "service_role";


--
-- Name: TABLE "newsletter_subscriptions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."newsletter_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscriptions" TO "service_role";


--
-- Name: TABLE "ops_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_requests" TO "anon";
GRANT ALL ON TABLE "public"."ops_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_requests" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "signup_email_allowlist"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."signup_email_allowlist" TO "anon";
GRANT ALL ON TABLE "public"."signup_email_allowlist" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_email_allowlist" TO "service_role";
GRANT SELECT ON TABLE "public"."signup_email_allowlist" TO "supabase_auth_admin";


--
-- Name: TABLE "sources"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sources" TO "anon";
GRANT ALL ON TABLE "public"."sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sources" TO "service_role";


--
-- Name: TABLE "translation_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."translation_settings" TO "service_role";


--
-- Name: TABLE "translation_usage"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."translation_usage" TO "anon";
GRANT ALL ON TABLE "public"."translation_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."translation_usage" TO "service_role";


--
-- Name: SEQUENCE "translation_usage_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."translation_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."translation_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."translation_usage_id_seq" TO "service_role";


--
-- Name: TABLE "trending_issue_articles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."trending_issue_articles" TO "anon";
GRANT ALL ON TABLE "public"."trending_issue_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."trending_issue_articles" TO "service_role";


--
-- Name: TABLE "trending_keywords"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."trending_keywords" TO "anon";
GRANT ALL ON TABLE "public"."trending_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."trending_keywords" TO "service_role";


--
-- Name: TABLE "trending_snapshots"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."trending_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."trending_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."trending_snapshots" TO "service_role";


--
-- Name: TABLE "tts_usage"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tts_usage" TO "service_role";


--
-- Name: TABLE "user_preferences"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";


--
-- Name: TABLE "user_service_prefs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_service_prefs" TO "anon";
GRANT ALL ON TABLE "public"."user_service_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_service_prefs" TO "service_role";


--
-- Name: TABLE "user_services"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_services" TO "anon";
GRANT ALL ON TABLE "public"."user_services" TO "authenticated";
GRANT ALL ON TABLE "public"."user_services" TO "service_role";


--
-- Name: TABLE "user_watchlist"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_watchlist" TO "anon";
GRANT ALL ON TABLE "public"."user_watchlist" TO "authenticated";
GRANT ALL ON TABLE "public"."user_watchlist" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: TABLE "weekly_flows"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."weekly_flows" TO "anon";
GRANT ALL ON TABLE "public"."weekly_flows" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_flows" TO "service_role";


--
-- Name: TABLE "youtube_videos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."youtube_videos" TO "anon";
GRANT ALL ON TABLE "public"."youtube_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_videos" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict 0g4lUvC1EHN0RUcEujbYZdz2XTLCWNPeUBUjC9BOnwIdb0q99RjrWkwOIa1wRNC
-- 486: 관리자 행위 감사 로그
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  actor_email text,
  action text not null,
  method text,
  path text,
  capability text,
  target_type text,
  target_id text,
  target_count integer,
  payload jsonb,
  outcome text not null default 'started' check (outcome in ('started', 'ok', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);
alter table public.admin_audit_log enable row level security;
drop policy if exists "admin_audit_log: admin 조회" on public.admin_audit_log;
create policy "admin_audit_log: admin 조회" on public.admin_audit_log for select using (public.is_admin());
