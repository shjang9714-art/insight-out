-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1-A SQL 핸드오프 (수희) — 게시-게이트 전환 스키마 선행
-- 작성: 플래너(Opus) · 2026-07-24
-- 선행: 이 SQL이 먼저 적용돼야 Phase 1-B(ingest flip, Sonnet)가 discovered_at 을 쓸 수 있음.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 배경: 짧은 RSS 기사를 적재 전 reject 하던 걸 stub(pending) 저장으로 바꾼다(B).
--       그 전에 (1) 발견 시각 컬럼, (2) 수집 주기 미설정 소스 보정이 필요하다.
--
-- ■ content_status enum: 'pending'/'published'/'rejected' 이미 존재 → 변경 없음.
-- ■ published_at 이미 nullable → 변경 없음.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) discovered_at — 시스템 최초 발견 시각(필수). 원문 발행일(published_at)과 별개.
--    기존 행은 collected_at 으로 소급.
ALTER TABLE "public"."contents"
  ADD COLUMN IF NOT EXISTS "discovered_at" timestamptz;

UPDATE "public"."contents"
  SET "discovered_at" = COALESCE("discovered_at", "collected_at", "now"())
  WHERE "discovered_at" IS NULL;

ALTER TABLE "public"."contents"
  ALTER COLUMN "discovered_at" SET DEFAULT "now"(),
  ALTER COLUMN "discovered_at" SET NOT NULL;

-- 2) crawl_interval_minutes 보정 — NULL/0 인 활성 소스는 기본 주기 적용(영구 제외 방지).
--    ⚠️ 소스 테이블/활성 컬럼명 확인 후 조정. (아래는 sources.is_active 가정)
--    기본 주기 720분(12h)은 예시 — 운영 판단에 맞게.
UPDATE "public"."sources"
  SET "crawl_interval_minutes" = 720
  WHERE ("crawl_interval_minutes" IS NULL OR "crawl_interval_minutes" = 0)
    AND COALESCE("is_active", true) = true;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증
-- ─────────────────────────────────────────────────────────────────────────────
-- (a) SELECT count(*) FROM contents WHERE discovered_at IS NULL;              -- 0
-- (b) SELECT count(*) FROM sources
--       WHERE (crawl_interval_minutes IS NULL OR crawl_interval_minutes = 0)
--         AND COALESCE(is_active,true)=true;                                  -- 0
-- (c) \d contents  → discovered_at not null, default now()
--
-- 주의: 소스 테이블 컬럼명(is_active / disabled 등)은 실제 스키마로 확인 후 (2) 조건 확정.
-- ─────────────────────────────────────────────────────────────────────────────
