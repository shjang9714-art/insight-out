-- 동일 rss_url 중복 소스 방지(부분 unique). import insert가 23505로 중복을 건너뜁니다.
create unique index if not exists sources_rss_url_key
  on public.sources (rss_url) where rss_url is not null;
