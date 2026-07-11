-- ============================================================
-- '빅테크' 키워드 그룹 패턴 확장 (국문 표기 + 누락 기업)
-- 지시서: docs/sonnet-지시서/지시서_20260711_빅테크-키워드그룹-패턴확장.md
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 배경: 2026-07-11 daily_insights #1(AI 에이전트) 미분류 원인 =
--       '빅테크' include_patterns가 영문 전용이라 국문 표기(오픈AI/메타/네이버 등) 기사를 못 잡음.
-- §4-1 오탐 테스트(최근 30일 1000건 스캔) 결과 반영:
--   - 국문 bare "메타"는 제외(실측 오탐 3건: 라온메타×2, 메타버스 플랫폼×1).
--   - 영문 "Meta"는 patternHit()의 4자 이하 영숫자 단어경계 보호 대상이라 안전(오탐 0건, 9건 전부 정상).
--   - 나머지 15개 패턴은 오탐 0건 확인.
-- 기존 include_patterns 값은 보존(append, 중복 제거).
-- ============================================================

update public.keyword_groups
set
  include_patterns = (
    select array_agg(distinct p order by p)
    from unnest(
      include_patterns || array[
        '오픈AI', '챗GPT', '구글', '네이버', '엔비디아', '아마존', '마이크로소프트', '앤스로픽', '스페이스X',
        'Meta', 'SpaceX', 'Naver', 'Anthropic', 'ChatGPT', 'xAI', 'Gemini'
      ]
    ) as p
  ),
  updated_at = now()
where name = '빅테크';

-- ── 확인 쿼리 ──────────────────────────────────────────────────
select name, include_patterns, updated_at
from public.keyword_groups
where name = '빅테크';
