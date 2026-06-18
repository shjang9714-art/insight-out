-- 핸드오프 96 — contents.sentiment (경쟁사 기사 논조 태그)
-- 적용: 수희(Supabase SQL Editor). 멱등(if not exists). 코드는 컬럼 미적용이어도
--       try/catch·graceful 로 무중단(백필 endpoint 는 0건 처리, 페이지는 배지 생략).
-- SSOT: supabase/schema.sql 의 contents 정의에도 동일 반영(#6).

alter table public.contents
  add column if not exists sentiment text
    check (sentiment is null or sentiment in ('긍정', '중립', '부정'));

comment on column public.contents.sentiment is
  '경쟁사 기사 논조(LLM 분석) — 긍정/중립/부정, null = 미분석. 시장 톤 기준(LGU+ 위협도 아님).';
