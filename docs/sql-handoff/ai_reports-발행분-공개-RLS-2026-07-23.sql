-- ─────────────────────────────────────────────────────────────────────────────
-- SQL 핸드오프 (수희) — AI 리포트 발행분이 일반 사용자에게 안 보이는 문제
-- 작성: 플래너(Opus) · 2026-07-23 · 육안 제보(David 에겐 보이나 타 사용자에겐 안 보임)
-- 영역: RLS 정책 추가 (SQL 전용, 앱 코드 변경 없음)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ■ 증상
--   발행된 AI 리포트가 작성자(David)·관리자에게만 보이고 다른 사용자에겐 목록·상세
--   모두 안 뜬다.
--
-- ■ 근본 원인 — RLS SELECT 정책 누락
--   ai_reports 의 SELECT 정책은 현재 둘뿐:
--     · "ai_reports: admin 전체 조회"  → is_admin()
--     · "ai_reports: 본인 조회"        → auth.uid() = user_id
--   RLS 는 정책들을 OR 로 합치므로 실효 가시성 = (관리자 OR 작성자 본인).
--   → "발행분(published_at IS NOT NULL)을 모든 로그인 사용자가 읽는" 정책이 없다.
--   앱(getPublishedReports)은 published_at 필터를 제대로 걸지만, RLS 가 그 전에
--   행을 통째로 걸러 일반 사용자에겐 0건이 된다. 상세 페이지도 같은 RLS 클라이언트라
--   published 리포트가 notFound 로 빠진다.
--
--   근거 출처 테이블 ai_report_sources 도 동일 — SELECT 가 "본인 조회"(부모 리포트
--   user_id = auth.uid())뿐이라, 리포트가 보여도 일반 사용자에겐 출처가 비게 된다.
--
-- ■ 조치 — 발행분 공개 SELECT 정책 2개 추가 (로그인 사용자 대상)
--   앱 코드는 이미 발행분만 노출하므로(목록 필터 + 상세 가드) 초안은 계속 숨겨진다.
--   이 정책은 published_at IS NOT NULL 행만 열어 주므로 초안 유출 없음.
--
-- ■ 안전성
--   · 초안(published_at IS NULL) → 정책 조건 불충족 → 여전히 작성자·관리자만.
--   · TO authenticated 로 한정 → 비로그인(anon) 노출 없음(리포트는 로그인 뒤 화면).
--   · 기존 정책 무삭제 — OR 로 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) ai_reports — 발행분은 모든 로그인 사용자가 조회
DROP POLICY IF EXISTS "ai_reports: 발행분 전체 조회" ON "public"."ai_reports";
CREATE POLICY "ai_reports: 발행분 전체 조회"
  ON "public"."ai_reports"
  FOR SELECT
  TO "authenticated"
  USING ("published_at" IS NOT NULL);

-- 2) ai_report_sources — 발행된 리포트의 근거 출처는 모든 로그인 사용자가 조회
DROP POLICY IF EXISTS "ai_report_sources: 발행분 근거 조회" ON "public"."ai_report_sources";
CREATE POLICY "ai_report_sources: 발행분 근거 조회"
  ON "public"."ai_report_sources"
  FOR SELECT
  TO "authenticated"
  USING (EXISTS (
    SELECT 1
    FROM "public"."ai_reports" "r"
    WHERE "r"."id" = "ai_report_sources"."ai_report_id"
      AND "r"."published_at" IS NOT NULL
  ));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증 (적용 후)
-- ─────────────────────────────────────────────────────────────────────────────
-- (a) 정책이 붙었는지
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename IN ('ai_reports','ai_report_sources') ORDER BY tablename, policyname;
--
-- (b) 일반 사용자 시점 재현 — 임의의 비관리자 user_id 로 RLS 시뮬레이션
--   (Supabase SQL Editor 에서 role/claims 세팅이 어렵다면, 실제 비관리자 계정으로
--    /dashboard/reports 접속해 발행 카드가 뜨는지 + 카드 클릭 시 상세·근거 출처가
--    보이는지 육안 확인이 가장 확실.)
--
-- (c) 초안이 여전히 숨는지
--   비관리자로 접속 시 published_at IS NULL 리포트는 목록·상세에서 안 보여야 정상.
-- ─────────────────────────────────────────────────────────────────────────────
