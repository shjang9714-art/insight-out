-- ============================================================
-- 핸드오프 117 — 지식그래프 강화 (최근성 가중 + 엣지 맥락)
-- 수희 실행: Supabase SQL Editor. 99(content_entities) 적용 후.
-- 1) entity_neighbors 교체: 공기출현에 최근성 가중(최근 30일 ×2). 컬럼 동일(드롭인).
-- 2) entity_pair_contents 신규: 두 엔티티가 함께 등장한 기사(엣지 호버 맥락).
-- 읽기 전용·authed.
-- ============================================================

-- 1) 최근성 가중 entity_neighbors (반환 컬럼 동일 → 116 컴포넌트 드롭인)
create or replace function public.entity_neighbors(
  p_entity_id  uuid,
  p_limit      integer default 20,
  p_min_weight integer default 1
)
returns table (entity_id uuid, weight bigint)
language sql stable security invoker set search_path = public
as $$
  select
    case when a.entity_id = p_entity_id then b.entity_id else a.entity_id end as entity_id,
    sum(case when c.collected_at >= now() - interval '30 days' then 2 else 1 end)::bigint as weight
  from public.content_entities a
  join public.content_entities b
    on a.content_id = b.content_id and a.entity_id < b.entity_id
  join public.contents c on c.id = a.content_id
  where a.entity_id = p_entity_id or b.entity_id = p_entity_id
  group by 1
  having sum(case when c.collected_at >= now() - interval '30 days' then 2 else 1 end) >= greatest(p_min_weight, 1)
  order by 2 desc
  limit least(greatest(p_limit, 1), 50)
$$;
grant execute on function public.entity_neighbors(uuid, integer, integer) to authenticated;

-- 2) 엣지 맥락: 두 엔티티가 함께 등장한 기사
create or replace function public.entity_pair_contents(
  p_a     uuid,
  p_b     uuid,
  p_limit integer default 5
)
returns table (content_id uuid, title text, collected_at timestamptz)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.title, c.collected_at
  from public.content_entities ca
  join public.content_entities cb on ca.content_id = cb.content_id
  join public.contents c on c.id = ca.content_id
  where ca.entity_id = p_a and cb.entity_id = p_b and ca.entity_id <> cb.entity_id
    and c.status = 'published'
  order by c.collected_at desc
  limit least(greatest(p_limit, 1), 20)
$$;
revoke all on function public.entity_pair_contents(uuid, uuid, integer) from public;
grant execute on function public.entity_pair_contents(uuid, uuid, integer) to authenticated;

-- 검증
-- select * from public.entity_neighbors('<uuid>',20,1);
-- select * from public.entity_pair_contents('<uuid-a>','<uuid-b>',5);
