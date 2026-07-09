-- 241 LG U+ 관점 위기/기회 분류 — contents.lgu_impact 컬럼
-- 핸드오프: 수희 → Supabase SQL Editor. 그대로 실행(한 번에 OK).
-- 목적: 경쟁사(뉴스)에서 논조(sentiment 긍정/부정) 대신 LG U+ 관점의 위기/기회/관망을 표시.
--   sentiment(뉴스 자체 논조)와 별개 차원 → 새 컬럼 추가(sentiment는 유지).
-- 값: 위기(threat) / 기회(opportunity) / 관망(neutral·영향불명). null=미분석(LLM 온디맨드 백필).

alter table public.contents
  add column if not exists lgu_impact text
    check (lgu_impact is null or lgu_impact in ('위기', '기회', '관망'));

comment on column public.contents.lgu_impact is
  'LG U+ 전략 관점의 뉴스 영향 — 위기/기회/관망. LLM 온디맨드 백필(241). null=미분석. sentiment와 독립.';

-- 백필 후보 조회 성능(경쟁사 관련·미분석 최근) — 부분 인덱스
create index if not exists contents_lgu_impact_null_idx
  on public.contents (collected_at desc)
  where lgu_impact is null and status = 'published';

-- 검증:
-- select lgu_impact, count(*) from public.contents group by lgu_impact order by 1;
