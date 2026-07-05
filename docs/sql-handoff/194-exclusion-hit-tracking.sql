-- 194: 제외 규칙 효과 추적. hit_count 누적(190에서 컬럼만 있고 미갱신) + last_hit_at 추가.
-- 크롤 런 종료 시 배치로 갱신(아이템별 update 아님). 규칙이 실제로 무엇을 얼마나 걸렀는지 어드민에서 가시화.
-- 멱등. 미적용 시 194 코드는 graceful skip(hit_count 0·last_hit_at null 유지 → 리포트는 "아직 집계 전"으로 표시).

-- STEP 1. last_hit_at 컬럼 (hit_count 는 190 에서 이미 존재)
alter table exclusion_rules
  add column if not exists last_hit_at timestamptz;

-- STEP 2. 배치 증가 RPC — 한 번의 호출로 여러 규칙의 hit_count 를 delta 만큼 증가 + last_hit_at 갱신.
--   인자 hits = jsonb 객체 { "<rule_id>": <delta>, ... }  (크롤 런 동안 집계한 매칭 수)
--   read-modify-write 경쟁 없이 원자적. 존재하지 않는 id 는 무시(조인).
create or replace function increment_exclusion_hits(hits jsonb)
returns void
language sql
as $$
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

-- 확인:
-- select id, rule_type, value, action, hit_count, last_hit_at from exclusion_rules order by hit_count desc;
