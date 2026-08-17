-- 지시서 521 — 엔티티 사전(계층·병합) 서버 액션화
--
-- merge_entities(p_source, p_target)의 is_admin() 검사는 auth.uid() 기반이라
-- service role(서버 액션)로 호출하면 항상 실패한다. 서버 액션이 requireAdminAction
-- (manage_sources capability)으로 이미 인가하므로, service_role 호출은 DB 레벨
-- is_admin() 검사를 건너뛴다.
--
-- 주의: 이 함수는 SECURITY DEFINER라 함수 내부의 current_user/session_user는 항상
-- 함수 소유자(postgres)/PostgREST 연결 계정(authenticator)으로 고정되고 실제 호출자를
-- 반영하지 않는다(lock_approval_columns처럼 SECURITY DEFINER가 아닌 트리거와 다름).
-- 대신 PostgREST가 매 요청마다 주입하는 request.jwt.claims의 role 클레임으로 판별해야
-- service_role 호출을 정확히 식별할 수 있다. (첫 시도에서 current_user 검사로 배포했다가
-- 실제 서버 액션 호출이 전부 실패하는 걸 확인하고 이 방식으로 수정함 — 같은 실수 반복 방지용 기록.)
--
-- 상태: 2026-08-17 Supabase MCP로 프로덕션(xalptogjhbiahrbgxhvu)에 직접 적용·검증 완료.
--       이 파일은 schema.sql과의 동기화 기록용.

CREATE OR REPLACE FUNCTION public.merge_entities(p_source uuid, p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
begin
  if v_caller_role <> 'service_role' and not public.is_admin() then
    raise exception '관리자만 병합할 수 있습니다.';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    return;
  end if;

  delete from public.content_entities cs
  where cs.entity_id = p_source
    and exists (
      select 1 from public.content_entities ct
      where ct.entity_id = p_target and ct.content_id = cs.content_id
    );
  update public.content_entities set entity_id = p_target where entity_id = p_source;

  update public.entity_aliases set entity_id = p_target where entity_id = p_source;

  insert into public.entity_aliases (entity_id, alias)
  select p_target, e.canonical_name from public.entities e where e.id = p_source
  on conflict (lower(alias)) do nothing;

  delete from public.entities where id = p_source;

  update public.entities e
  set mention_count = (
    select count(*) from public.content_entities ce where ce.entity_id = p_target
  )
  where e.id = p_target;
end;
$function$;
