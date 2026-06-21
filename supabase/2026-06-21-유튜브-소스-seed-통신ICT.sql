-- ============================================================
-- 유튜브 채널 소스 seed — 2026-06-21
-- 목적: 통신/ICT 전문 채널 4개 추가 (국내 2 + 해외 2)
-- 실행: 수희 (Supabase SQL Editor) — 실행 후 /api/cron/crawl?days=30 트리거
-- 멱등: rss_url 기준 not exists 가드 → 여러 번 실행해도 중복 INSERT 없음.
-- 참고:
--   - type = 'youtube_channel', collection_method = 'youtube'
--   - rss_url = https://www.youtube.com/feeds/videos.xml?channel_id={UC...}
--   - "order" 는 9006~9009 (기존 9001~9005와 분리)
-- ============================================================

begin;

-- 6) TTA 한국정보통신기술협회 (국내 · ICT 표준화, 기술 트렌드 세미나)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'TTA 한국정보통신기술협회', 'youtube_channel',
       'https://www.youtube.com/channel/UCnxJSvHKZe3cvUwjsKr0H8w',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCnxJSvHKZe3cvUwjsKr0H8w',
       true, 1440, 'youtube', 1, 9006, 'TTA 한국정보통신기술협회'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCnxJSvHKZe3cvUwjsKr0H8w'
);

-- 7) 정보통신기획평가원(IITP) (국내 · ICT R&D 정책, AI/통신 기술동향)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select '정보통신기획평가원(IITP)', 'youtube_channel',
       'https://www.youtube.com/channel/UCGUKNSSKNFMRUSIhrkS6HzQ',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCGUKNSSKNFMRUSIhrkS6HzQ',
       true, 1440, 'youtube', 1, 9007, '정보통신기획평가원(IITP)'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGUKNSSKNFMRUSIhrkS6HzQ'
);

-- 8) Ericsson (해외 · 5G 네트워크, 통신사 전략 인사이트)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'Ericsson', 'youtube_channel',
       'https://www.youtube.com/channel/UCYaPuN9wvwP8gXUUezdvSUQ',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCYaPuN9wvwP8gXUUezdvSUQ',
       true, 1440, 'youtube', 2, 9008, 'Ericsson'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCYaPuN9wvwP8gXUUezdvSUQ'
);

-- 9) Nokia (해외 · 네트워크 기술, B2B 솔루션, 통신 인프라)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'Nokia', 'youtube_channel',
       'https://www.youtube.com/channel/UCMdtv1z_kXj7Wd97MA7BjXA',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCMdtv1z_kXj7Wd97MA7BjXA',
       true, 1440, 'youtube', 2, 9009, 'Nokia'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCMdtv1z_kXj7Wd97MA7BjXA'
);

commit;

-- ─── 확인 쿼리 ────────────────────────────────────────────────────────────────
-- select name, type, collection_method, is_active, "order", group_name
-- from public.sources
-- where type = 'youtube_channel' and "order" between 9006 and 9009
-- order by "order";
