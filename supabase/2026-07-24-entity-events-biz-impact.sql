-- 지시서 A: 사건 타임라인 '긍정/부정' → 자사(LG U+) 관점 '위기/기회' 재판정
-- entity_events 에 biz_impact / biz_impact_reason 신규 컬럼 추가.
-- 기존 sentiment 컬럼은 그대로 둔다(다른 화면 미참조, 무해 — 삭제하지 않음).
--
-- 실행: Supabase SQL Editor 에서 그대로 실행.

ALTER TABLE "public"."entity_events"
  ADD COLUMN IF NOT EXISTS "biz_impact" "text",
  ADD COLUMN IF NOT EXISTS "biz_impact_reason" "text";

ALTER TABLE "public"."entity_events"
  ADD CONSTRAINT "entity_events_biz_impact_check"
  CHECK (("biz_impact" = ANY (ARRAY['crisis'::"text", 'opportunity'::"text", 'neutral'::"text"])));

-- 기존 테이블 GRANT(anon/authenticated/service_role: ALL)가 신규 컬럼에도 자동 적용되지만,
-- 확인 차원에서 명시적으로 재확인.
GRANT ALL ON TABLE "public"."entity_events" TO "anon";
GRANT ALL ON TABLE "public"."entity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_events" TO "service_role";
