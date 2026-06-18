-- ============================================================
-- 핸드오프 100 — merge_entities RPC (엔티티 정규화/병합)
-- 수희 실행: Supabase → SQL Editor. 99-entities.sql 적용 후 실행.
-- 어드민이 "MS"와 "Microsoft" 같은 중복 엔티티를 하나로 병합할 때 호출.
-- SECURITY DEFINER + is_admin() 내부 검사 → authenticated(어드민만 통과) 호출 허용.
-- ============================================================

create or replace function public.merge_entities(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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

revoke all on function public.merge_entities(uuid, uuid) from public;
grant execute on function public.merge_entities(uuid, uuid) to authenticated;

-- 검증
-- select public.merge_entities('<source-uuid>', '<target-uuid>');
