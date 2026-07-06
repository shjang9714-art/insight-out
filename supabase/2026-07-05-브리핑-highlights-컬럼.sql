-- 브리핑 '오늘의 핵심 인사이트' 3줄 저장용 컬럼.
-- 홈 카드(TodayBriefingHighlights)가 기사 헤드라인 대신 합성된 시사점 한 줄씩을 보여주기 위함.
-- 형식: [{ "content_id": "<uuid>", "insight": "왜 중요한가 한 줄" }, ...] (최대 3)
-- 기존 테이블 컬럼 추가라 별도 GRANT 불필요(테이블 권한 상속). 기본값 NULL → 미생성 브리핑은 폴백 렌더.

ALTER TABLE public.briefings
  ADD COLUMN IF NOT EXISTS highlights jsonb;

COMMENT ON COLUMN public.briefings.highlights IS
  '오늘의 핵심 인사이트 3줄: [{content_id, insight}] 형태. generate-briefing/백필에서 채움.';
