-- ============================================================
-- 핸드오프 369 — 경쟁사 주간 브리핑: status 에 'archived'(보관) 추가
-- 수희 실행: Supabase → SQL Editor 에서 1회. 멱등.
-- 배경: 261 SQL이 competitor_weekly_reports.status 를 check(in ('draft','published'))
--   로 만들어서, 어드민이 '보관'으로 전환하면 23514(check_violation)로 실패한다.
-- ⚠️ 코드(src/app/api/admin/competitor-weekly/[id]/route.ts)는 이 SQL 미적용
--   상태에서도 23514 를 잡아 "SQL 369 미적용" 안내로 그레이스풀 처리한다 —
--   미적용이어도 초안/발행 전환·편집·삭제는 기존대로 정상 동작한다.
-- ============================================================

alter table public.competitor_weekly_reports
  drop constraint if exists competitor_weekly_reports_status_check;

alter table public.competitor_weekly_reports
  add constraint competitor_weekly_reports_status_check
  check (status in ('draft', 'published', 'archived'));

-- RLS 정책은 261 그대로 유지(변경 불필요):
--   "cwr: 인증 조회(published)" — status = 'published' 인 행만 일반 사용자 노출.
--   archived 는 이 정책에 걸리지 않아 자동으로 사용자 비노출.
--   "cwr: admin 전체" — 어드민은 status 무관 전체 접근 유지.

-- 검증:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.competitor_weekly_reports'::regclass and contype = 'c';
