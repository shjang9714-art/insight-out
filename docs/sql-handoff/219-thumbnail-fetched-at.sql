-- 219 크롤 썸네일 재시도(og:image) — contents.thumbnail_fetched_at 마커 컬럼
-- 핸드오프: 수희 → Supabase SQL Editor 실행. 멱등.
-- 목적: 크롤 콘텐츠(뉴스/웹인사이트) 중 thumbnail_url 이 비어 있는 건에 대해
--   원문 og:image 재수집을 1회씩만 시도했는지 표시하는 마커.
--   null = 아직 시도 안 함(재시도 대상). 값 있으면 시도 완료(성공/실패 무관) → 재드레인 제외.
-- 관련: 지시서 219. 코드는 42703 graceful(컬럼 없으면 재시도 op이 "SQL 적용 필요" 안내로 degrade,
--   기존 크롤·상세·표시는 안 깨짐) → SQL 적용 후 기능 점등.

alter table public.contents add column if not exists thumbnail_fetched_at timestamptz;

comment on column public.contents.thumbnail_fetched_at is
  '크롤 콘텐츠 og:image 썸네일 재수집 시도 시각(지시서 219). null=미시도(재시도 대상). 성공·실패 무관하게 1회 시도 후 기록 → 무한 재시도 방지.';

-- (선택) 재시도 대상 조회 성능용 부분 인덱스:
create index if not exists idx_contents_thumb_retry
  on public.contents (collected_at desc)
  where thumbnail_url is null and thumbnail_fetched_at is null and original_url is not null;

-- 확인:
-- select count(*) as 재시도대상 from public.contents
--   where category in ('뉴스','웹인사이트') and thumbnail_url is null
--     and thumbnail_fetched_at is null and original_url is not null;
