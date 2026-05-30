-- ============================================================
-- [수희 실행용] Phase 1-B · STEP 1/4 — ENUM 타입
-- 적용처: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 선행조건: 없음 (타입은 가장 먼저)
-- 다음 단계: 02-tables.sql
-- ============================================================

-- 콘텐츠 8개 카테고리
create type content_category as enum (
  '뉴스',
  '가트너',
  'KRG',
  '웹인사이트',
  '오피니언',
  '뉴스레터',
  'AI보고서',
  '유튜브'
);

-- 수집 출처 유형
create type source_type as enum (
  'news_site',
  'report_publisher',
  'opinion_channel',
  'newsletter',
  'youtube_channel'
);

-- AI 보고서 유형
create type ai_report_type as enum (
  '시장동향',
  '경쟁사분석',
  '키워드분석',
  '서비스리포트',
  '자유주제'
);

-- AI 보고서 생성 상태
create type ai_report_status as enum (
  'draft',
  'generating',
  'completed',
  'failed'
);
