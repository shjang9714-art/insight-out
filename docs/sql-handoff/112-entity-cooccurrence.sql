-- ============================================================
-- 핸드오프 112 — entity_cooccurrence RPC (지식그래프 엣지)
-- 수희 실행: Supabase SQL Editor. 99(content_entities) 적용 후.
-- 같은 콘텐츠에 함께 링크된 엔티티 쌍 = 관계(엣지), 공기출현 횟수 = 가중치.
-- 읽기 전용·authed. 노드는 앱이 entities(mention_count 상위)로 별도 조회.
-- ============================================================

create or replace function public.entity_cooccurrence(
  p_min_weight integer default 3,
  p_limit      integer default 400
)
returns table (source uuid, target uuid, weight bigint)
language sql
stable
security invoker
set search_path = public
as $$
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

revoke all on function public.entity_cooccurrence(integer, integer) from public;
grant execute on function public.entity_cooccurrence(integer, integer) to authenticated;

-- 검증
-- select * from public.entity_cooccurrence(3, 50);
