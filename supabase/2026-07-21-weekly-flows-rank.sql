-- ============================================================
-- weekly_flows: 주당 1건 → 주당 상위 2~3건(rank) 확장
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 배경: "이번 주 한눈에 보는 흐름"이 그 주 가장 중요한 이슈 1건만 보여주던 것을,
--   상위 2~3건으로 확장한다. week_of 단독 PK로는 주당 1행만 저장 가능하므로
--   PK를 (week_of, rank) 복합키로 바꾼다. 기존 행(week_of만 있던 2건)은 rank
--   기본값 1로 채워 그대로 rank=1 행이 된다 — 데이터 유실 없음.
-- ============================================================

alter table public.weekly_flows
  add column if not exists rank smallint not null default 1;

alter table public.weekly_flows
  drop constraint if exists weekly_flows_pkey;

alter table public.weekly_flows
  add constraint weekly_flows_pkey primary key (week_of, rank);

-- 확인 쿼리
select week_of, rank, headline, created_at from public.weekly_flows order by week_of desc, rank asc;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.weekly_flows'::regclass;
