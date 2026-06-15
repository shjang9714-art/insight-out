-- ============================================================
-- keyword_groups include_patterns 보강 (2026-06-16)
-- 목적: pending에 묶인 KT·AI 등 B2B 관련 기사를 published로 올리기 위해
--       관련도 점수(relatednessScore)에 쓰이는 keyword_groups 패턴 추가.
-- 실행: 수희 (Supabase SQL Editor)
-- 순서:
--   Step 1 — 현재 그룹 조회 (어느 그룹에 패턴 추가할지 확인용)
--   Step 2 — 패턴 추가 (Step 1 결과 보고 그룹명 확인 후 실행)
-- ⚠️ Step 1만 먼저 실행해서 그룹 목록 확인 후 Step 2 실행할 것.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 1. 현재 keyword_groups 전체 조회                  │
-- └─────────────────────────────────────────────────────────┘
select
  id,
  name,
  kind,
  tag_type,
  weight,
  is_active,
  array_length(include_patterns, 1) as pattern_count,
  include_patterns
from public.keyword_groups
order by kind, name;


-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 2. 패턴 추가                                       │
-- │  Step 1 결과를 확인한 뒤 아래를 실행.                  │
-- │  각 UPDATE는 해당 그룹이 없으면 0 rows affected.       │
-- └─────────────────────────────────────────────────────────┘

begin;

-- ── 경쟁사 그룹: KT·SKT 계열 패턴 추가 ──────────────────────────────────
-- 그룹명이 다를 경우 name = '...' 부분을 Step 1 결과에 맞게 수정.
update public.keyword_groups
set include_patterns = (
  select array(
    select distinct unnest(include_patterns || array[
      'kt', 'kt그룹', 'kt닷컴', 'kt클라우드', 'ktf', 'kt엠모바일',
      'sk텔레콤', 'skt', 'sk브로드밴드', 'skb',
      'lg유플러스', 'lgu+', 'u+',
      '통신3사', '이통사', '이동통신', '통신사'
    ])
  )
)
where kind = 'competitor'
  and is_active = true;

-- ── 기술/AI 그룹: AI·LLM 관련 패턴 추가 ────────────────────────────────
update public.keyword_groups
set include_patterns = (
  select array(
    select distinct unnest(include_patterns || array[
      'ai', '인공지능', '생성형 ai', '생성형ai', 'llm', 'gpt', 'chatgpt',
      '클로드', 'claude', '제미나이', 'gemini',
      '대형언어모델', 'sllm', 'slm', 'ai에이전트', 'agentic',
      '멀티모달', 'rag', '파인튜닝'
    ])
  )
)
where (kind ilike '%tech%' or kind ilike '%ai%' or kind ilike '%기술%'
    or name ilike '%AI%' or name ilike '%인공지능%' or name ilike '%기술%')
  and is_active = true;

-- ── 클라우드 그룹: 클라우드·보안 패턴 보강 ──────────────────────────────
update public.keyword_groups
set include_patterns = (
  select array(
    select distinct unnest(include_patterns || array[
      '클라우드', 'aws', 'azure', 'gcp', 'ncp', '네이버클라우드',
      'saas', 'iaas', 'paas', 'msp', '멀티클라우드', '하이브리드클라우드',
      '제로트러스트', 'sase', 'cspm'
    ])
  )
)
where (kind ilike '%cloud%' or kind ilike '%클라우드%' or kind ilike '%보안%'
    or name ilike '%클라우드%' or name ilike '%보안%' or name ilike '%cloud%')
  and is_active = true;

-- ── 전 그룹 공통: weight 0 그룹은 제외되므로 확인용 ────────────────────
-- (수정 없음, 참고용)
-- select name, weight from keyword_groups where weight = 0;

commit;

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 3. 검증 — 패턴 추가 후 확인                       │
-- └─────────────────────────────────────────────────────────┘
select
  name,
  kind,
  array_length(include_patterns, 1) as pattern_count,
  include_patterns
from public.keyword_groups
where is_active = true
order by kind, name;

-- ┌─────────────────────────────────────────────────────────┐
-- │ STEP 4 (선택). pending → published 백필                 │
-- │  Step 2 패턴 추가 후, 기존 pending 기사 중              │
-- │  새 패턴에 매칭되는 것을 published로 올리는 경우.       │
-- │  주의: 크롤러가 다음 실행 시 자동 적용되므로 백필은     │
-- │  선택 사항. 지금 당장 노출하려면 아래 실행.             │
-- └─────────────────────────────────────────────────────────┘

-- 예: KT 포함 pending 기사 → published
-- update public.contents
-- set status = 'published', collected_at = coalesce(collected_at, now())
-- where status = 'pending'
--   and (
--     title ilike '%kt%' or title ilike '%KT%'
--     or summary_ko ilike '%kt%'
--     or body_original ilike '%kt%'
--   );

-- 예: AI 포함 pending 기사 → published
-- update public.contents
-- set status = 'published', collected_at = coalesce(collected_at, now())
-- where status = 'pending'
--   and (
--     title ilike '%ai%' or title ilike '% AI %'
--     or title ilike '%인공지능%'
--     or summary_ko ilike '%인공지능%' or summary_ko ilike '%ai%'
--   );
