-- 지시서 57 — contents 테이블에 keyword_groups 매칭 결과 컬럼 추가
-- 실행자: 수희 (Supabase SQL 에디터)
-- post-insert update로 채워지므로 SQL 적용 전 배포 가능 (미적용 시 update만 skip, insert 정상)

alter table public.contents
  add column if not exists matched_groups   text[] not null default '{}',
  add column if not exists matched_keywords text[] not null default '{}';

-- 배열 필터 대비 GIN 인덱스
create index if not exists contents_matched_groups_idx   on public.contents using gin (matched_groups);
create index if not exists contents_matched_keywords_idx on public.contents using gin (matched_keywords);
