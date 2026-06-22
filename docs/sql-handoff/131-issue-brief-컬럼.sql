-- 131: issues AI 브리핑 캐시 컬럼. 멱등.
-- brief jsonb: IssueBrief JSON { situation, drivers, sentiment_read, implications, citations }
-- brief_generated_at: 생성 시각
-- brief_model: 사용한 LLM 모델명
-- 수희 실행: Supabase Dashboard → SQL Editor

alter table public.issues
  add column if not exists brief jsonb,
  add column if not exists brief_generated_at timestamptz,
  add column if not exists brief_model text;

-- 확인
select
  count(*) filter (where brief is not null)     as 브리핑있음,
  count(*) filter (where brief is null)         as 브리핑없음,
  count(*)                                       as 전체
from public.issues;
