-- ============================================================
-- 핸드오프 116 — entity_neighbors RPC (ego 중심 그래프)
-- 수희 실행: Supabase SQL Editor. 99(content_entities) 적용 후.
-- 한 엔티티(center)의 공기출현 이웃 + 가중치를 반환 → ego 그래프.
-- min_weight 기본 1(얕은 데이터에서도 이웃 노출). 읽기 전용·authed.
-- ============================================================

create or replace function public.entity_neighbors(
  p_entity_id  uuid,
  p_limit      integer default 20,
  p_min_weight integer default 1
)
returns table (entity_id uuid, weight bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case when a.entity_id = p_entity_id then b.entity_id else a.entity_id end as entity_id,
    count(*) as weight
  from public.content_entities a
  join public.content_entities b
    on a.content_id = b.content_id
   and a.entity_id < b.entity_id
  where a.entity_id = p_entity_id or b.entity_id = p_entity_id
  group by 1
  having count(*) >= greatest(p_min_weight, 1)
  order by count(*) desc
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function public.entity_neighbors(uuid, integer, integer) from public;
grant execute on function public.entity_neighbors(uuid, integer, integer) to authenticated;

-- 검증
-- select * from public.entity_neighbors('<entity-uuid>', 20, 1);
