-- ============================================================
-- contents.body_fetched_at — 지연 풀본문 추출 마커 (#상세뷰) — 2026-06-04
-- 실행: 수희 (Supabase SQL Editor)
-- 용도: 기사 상세 조회 시 원문 풀본문을 1회 추출·캐시했는지 표시.
--   null      = 아직 추출 안 함(스니펫만) → 상세 조회 시 추출 시도
--   timestamp = 추출 시도 완료(성공: 전문 저장 / 실패: 스니펫 유지) → 재추출 안 함
-- 멱등: add column if not exists.
-- ============================================================

begin;

alter table public.contents
  add column if not exists body_fetched_at timestamptz;

commit;
