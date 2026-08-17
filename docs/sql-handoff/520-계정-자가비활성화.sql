-- 520 계정 자가 비활성화(F-09) — approval_status 에 'deactivated' 값 추가 + 감사용 컬럼
-- 핸드오프: 수희 → Supabase SQL Editor. ⚠ PostgreSQL 은 같은 트랜잭션에서 방금 추가한
-- enum 값을 바로 쓸 수 없으므로(pre-12 제약과 동일하게 안전을 위해 분리), 두 블록을 순서대로
-- 각각 실행할 것 (한 번에 붙여넣고 실행해도 무방 — 아래처럼 트랜잭션을 나눠뒀다).

-- ── 1) enum 값 추가 ───────────────────────────────────────────────────────────
begin;
alter type public.approval_status add value if not exists 'deactivated';
commit;

-- ── 2) 감사용 타임스탬프 컬럼 ─────────────────────────────────────────────────
begin;
alter table public.users
  add column if not exists deactivated_at timestamptz;
commit;

-- ============================================================
-- 검증
-- ============================================================
select enum_range(null::public.approval_status);
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'users' and column_name = 'deactivated_at';
