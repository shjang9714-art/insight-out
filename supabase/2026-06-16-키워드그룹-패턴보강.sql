-- ============================================================
-- keyword_groups include_patterns 보강 (2026-06-16)
-- 목적: pending에 묶인 B2B 관련 기사 발행률 향상
-- 실행: 수희 (Supabase SQL Editor)
-- 분석 결과:
--   - 경쟁사(competitor): 이미 "KT","SKT" 포함 → 패턴 문제 없음
--     → KT pending 기사는 KT야구단/KTX 등 비B2B일 가능성 높음
--   - AI 기술(ai_tech): "생성형 AI","LLM" 등 있으나 단독 "AI","인공지능" 없음
--     → "AI" 단독 언급 기사가 score 0 → pending 원인
--   - IT 동향(it_trend): "클라우드","DX" 등 있으나 "AI" 없음
--   - telecom_b2b: 5G/전용회선 중심, 기업통신 관련어 보강 여지
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 1. pending 기사 목록 조회 (내용 확인용)            │
-- └─────────────────────────────────────────────────────────┘
select
  id,
  title,
  category,
  left(coalesce(summary_ko, body_original, ''), 120) as preview,
  collected_at
from public.contents
where status = 'pending'
order by collected_at desc;


-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 2. 패턴 추가                                       │
-- └─────────────────────────────────────────────────────────┘

begin;

-- ── AI 기술(ai_tech): 단독 "AI"·"인공지능" 추가 ─────────────────────────
-- 현재: ["생성형 AI","AI Agent","Enterprise AI","Copilot","LLM","RAG","sovereign AI","AI 인프라"]
-- 추가: "AI","인공지능","초거대AI","거대언어모델","AI 도입","AI 활용","챗GPT"
update public.keyword_groups
set include_patterns = array(
  select distinct unnest(include_patterns || array[
    'AI', '인공지능', '초거대AI', '초거대 AI', '거대언어모델',
    'AI 도입', 'AI 활용', 'AI 전환', 'AI 혁신', '챗GPT', 'ChatGPT',
    'AI 서비스', 'AI 솔루션', 'AI 플랫폼', 'AI 기반', 'sLLM', 'SLM'
  ])
)
where kind = 'ai_tech';

-- ── IT 동향(it_trend): AI·인공지능 추가 ──────────────────────────────────
-- 현재: ["클라우드","SaaS","사이버보안","DX","플랫폼"]
-- 추가: "AI","인공지능","디지털전환","클라우드 전환"
update public.keyword_groups
set include_patterns = array(
  select distinct unnest(include_patterns || array[
    'AI', '인공지능', '디지털전환', 'DT', '클라우드 전환', '클라우드 도입',
    'AI 도입', '디지털화', '스마트화'
  ])
)
where kind = 'it_trend';

-- ── 경쟁사(competitor): KT·SKT B2B 맥락 패턴 보강 ────────────────────────
-- 현재: ["SKT","KT","SK브로드밴드","세종텔레콤","네이버클라우드","카카오엔터프라이즈","NHN Cloud"]
-- 추가: KT 기업/클라우드 관련 + LG유플러스
update public.keyword_groups
set include_patterns = array(
  select distinct unnest(include_patterns || array[
    'KT클라우드', 'KT 클라우드', 'KT AI', 'KT 기업', 'KT enterprise',
    'LG유플러스', 'LGU+', 'U+', 'LG U+',
    'SK텔레콤', 'SK C&C', '드림어스'
  ])
)
where kind = 'competitor';

-- ── 통신 B2B(telecom_b2b): 기업통신 관련어 보강 ──────────────────────────
-- 현재: ["5G 특화망","Private 5G","네트워크 슬라이싱","MEC","전용회선","M2M"]
-- 추가: 엔터프라이즈 통신, B2B, 기업망
update public.keyword_groups
set include_patterns = array(
  select distinct unnest(include_patterns || array[
    'B2B', '기업 통신', '기업통신', '엔터프라이즈', '기업망', '전용망',
    '기업 네트워크', 'SD-WAN', 'MPLS', '기업 5G', 'IoT 통신'
  ])
)
where kind = 'telecom_b2b';

-- ── 빅테크(bigtech): 한국어 표기 추가 ───────────────────────────────────
-- 현재: ["AWS","Microsoft","Azure","Google Cloud","Oracle","NVIDIA","OpenAI","Salesforce","ServiceNow"]
-- 추가: 한글 표기
update public.keyword_groups
set include_patterns = array(
  select distinct unnest(include_patterns || array[
    '아마존 웹서비스', '마이크로소프트', '구글 클라우드', '오라클', '엔비디아',
    'Meta', '메타', 'Anthropic', '앤트로픽', 'Mistral', '어도비'
  ])
)
where kind = 'bigtech';

commit;


-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 3. 검증 — 패턴 수 변경 확인                       │
-- └─────────────────────────────────────────────────────────┘
select name, kind, array_length(include_patterns, 1) as pattern_count
from public.keyword_groups
where is_active = true
order by kind, name;


-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 4. pending 기사 중 지금 바로 published 전환        │
-- │  (Step 1에서 제목 확인 후 B2B 관련 있으면 실행)         │
-- │  ⚠️ 주석 해제 후 실행. 비B2B(야구/KTX 등)는 제외.      │
-- └─────────────────────────────────────────────────────────┘

-- pending 전체 건수 확인
-- select count(*) from public.contents where status = 'pending';

-- AI·클라우드·데이터센터 관련 pending → published
-- update public.contents
-- set status = 'published'
-- where status = 'pending'
--   and (
--     title ilike '%AI%' or title ilike '%인공지능%'
--     or title ilike '%클라우드%' or title ilike '%데이터센터%'
--     or title ilike '%LLM%' or title ilike '%GPT%'
--     or summary_ko ilike '%AI%' or summary_ko ilike '%클라우드%'
--   );

-- KT 기업/통신 관련 pending → published (KT야구/KTX 제외)
-- update public.contents
-- set status = 'published'
-- where status = 'pending'
--   and (
--     title ilike '%KT 클라우드%' or title ilike '%KT AI%'
--     or title ilike '%KT 기업%' or title ilike '%KT enterprise%'
--   );
