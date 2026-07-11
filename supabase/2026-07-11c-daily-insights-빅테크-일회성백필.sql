-- ============================================================
-- 2026-07-11 daily_insights #1 소스기사 일회성 재태깅 (빅테크 백필)
-- 지시서: docs/sonnet-지시서/지시서_20260711_빅테크-키워드그룹-패턴확장.md §3
-- 실행: Supabase 대시보드 → SQL Editor (수희), SQL #1(2026-07-11b) 실행 후 진행
-- 배경: matched_groups 태깅은 ingest(수집) 시점 1회뿐이라, 위 SQL #1로 '빅테크'
--       패턴을 확장해도 이미 수집된 기존 기사에는 소급 반영되지 않음.
-- 범위: 2026-07-11 daily_insights #1의 근거기사 6건 중, 새 패턴으로 실제 재검증했을 때
--       genuinely 매칭되는 3건만(나머지 3건은 오픈AI/메타/네이버 등 무관 주제라 정당하게 제외 —
--       6건 전부에 강제 태깅하지 않음). 과거 전체 백필은 범위 밖(지시서 §3 주의).
-- ============================================================

update public.contents
set matched_groups = array(
  select distinct unnest(matched_groups || array['빅테크'])
)
where id in (
  '88ea8e8e-e393-4660-bb76-6137cd295721', -- 오픈AI, 사무용 에이전틱 AI '챗GPT 워크' 발표 (오픈AI·챗GPT·ChatGPT 매칭)
  'bc35d620-f2fb-4ae8-9db9-f2c67e808071', -- 메타·스페이스X, 'AI 코딩'에 사활 거는 이유는? (오픈AI·스페이스X 매칭)
  '0b8740cf-b778-46b2-82d2-9bcb9ca2e291'  -- 'FAQ'까지 접은 네이버…'AI 중심' 검색 재편 가속화 (네이버 매칭)
)
and not ('빅테크' = any(matched_groups));

-- ── 확인 쿼리 ──────────────────────────────────────────────────
select id, title, matched_groups
from public.contents
where id in (
  '88ea8e8e-e393-4660-bb76-6137cd295721',
  'bc35d620-f2fb-4ae8-9db9-f2c67e808071',
  '0b8740cf-b778-46b2-82d2-9bcb9ca2e291'
);

-- ── 재생성 안내(SQL 아님, 참고) ──────────────────────────────────
-- 위 2개 SQL 실행 후, daily_insights 2026-07-11 행 삭제 → /api/cron/daily-insights 재트리거로
-- 재생성해야 새 category 라벨이 반영됩니다(daily_insights 는 생성 시점에 category 를 확정 저장).
