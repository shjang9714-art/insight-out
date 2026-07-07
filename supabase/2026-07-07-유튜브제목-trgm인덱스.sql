-- 콘텐츠 상세 페이지의 "관련 유튜브" 추천(getRelatedYoutube)이
-- youtube_videos.title 에 대해 title.ilike.%keyword% 를 인덱스 없이
-- 매번 풀스캔하고 있어, 콘텐츠 상세를 열 때마다 불필요한 지연이 발생함.
-- pg_trgm 확장 + GIN(trigram) 인덱스를 추가해 ILIKE '%...%' 검색을 인덱스로 처리.

create extension if not exists pg_trgm;

create index if not exists youtube_videos_title_trgm_idx
  on public.youtube_videos
  using gin (title gin_trgm_ops);

-- 확인
select indexname, indexdef
from pg_indexes
where tablename = 'youtube_videos';
