-- 130: contents.body_len 생성컬럼(풀본문/스니펫 구분용). 멱등.
-- char_length 는 immutable → STORED 생성컬럼 가능. body_original 갱신 시 자동 재계산.
-- 수희 실행: Supabase Dashboard → SQL Editor

alter table public.contents
  add column if not exists body_len integer
  generated always as (char_length(body_original)) stored;

-- 필터 성능(선택): 부분 인덱스
create index if not exists idx_contents_body_len on public.contents (body_len);

-- 확인
select
  count(*) filter (where body_fetched_at is not null and body_len >= 400) as 풀본문,
  count(*) filter (where body_fetched_at is not null and body_len < 400)  as 스니펫,
  count(*) filter (where body_fetched_at is null)                          as 미시도
from public.contents;
