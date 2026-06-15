-- ============================================================
-- 유튜브 채널 소스 seed — 2026-06-16
-- 목적: AI / Telco / Big Tech 트렌드 모니터링용 유튜브 채널 5개 추가
--       (국내 3 + 해외 2, B2B M.I 관점)
-- 실행: 수희 (Supabase SQL Editor) — 머지/실행 후 /api/cron/crawl?days=30 트리거
-- 멱등: rss_url 기준 not exists 가드 → 여러 번 실행해도 중복 INSERT 없음.
-- 참고:
--   - type = 'youtube_channel', collection_method = 'youtube'
--   - rss_url = https://www.youtube.com/feeds/videos.xml?channel_id={UC...}
--   - crawler/adapters/youtube.ts 가 Atom 파싱 → orchestrator 가 contents/youtube_videos upsert
--   - YouTube Atom 피드는 최신 15건만 노출 → days 옵션과 무관하게 채널별 ~15건 적재
--   - "order" 는 9001~9005 (기존 news 소스 영역과 분리)
--   - group_name = 채널명 (필터/표시용; 소스-그룹핑 SQL 패턴 준수)
--   - crawl_interval_minutes = 1440 (24h) — 일1회 크론(KST 05:00)에 항상 수집 대상
-- ============================================================

begin;

-- 1) 티타임즈TV (국내 · 비즈니스/Tech/Transformation 인터뷰)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select '티타임즈TV', 'youtube_channel',
       'https://www.youtube.com/channel/UCelFN6fJ6OY6v8pbc_SLiXA',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCelFN6fJ6OY6v8pbc_SLiXA',
       true, 1440, 'youtube', 1, 9001, '티타임즈TV'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCelFN6fJ6OY6v8pbc_SLiXA'
);

-- 2) EO 이오 (국내 · 스타트업/테크 다큐)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'EO 이오', 'youtube_channel',
       'https://www.youtube.com/channel/UCQ2DWm5Md16Dc3xRwwhVE7Q',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCQ2DWm5Md16Dc3xRwwhVE7Q',
       true, 1440, 'youtube', 1, 9002, 'EO 이오'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQ2DWm5Md16Dc3xRwwhVE7Q'
);

-- 3) 안될공학 — IT 테크 신기술 (국내 · 반도체/AI/전기차/통신 트렌드)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select '안될공학', 'youtube_channel',
       'https://www.youtube.com/channel/UCeN2YeJcBCRJoXgzF_OU3qw',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCeN2YeJcBCRJoXgzF_OU3qw',
       true, 1440, 'youtube', 1, 9003, '안될공학'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCeN2YeJcBCRJoXgzF_OU3qw'
);

-- 4) Mobile World Live (해외 · GSMA 주관, Telco 1차 소스)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'Mobile World Live', 'youtube_channel',
       'https://www.youtube.com/channel/UCu2wmEQywQXC9XliK8sIwEA',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCu2wmEQywQXC9XliK8sIwEA',
       true, 1440, 'youtube', 2, 9004, 'Mobile World Live'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCu2wmEQywQXC9XliK8sIwEA'
);

-- 5) Bloomberg Technology (해외 · 빅테크 IR·실적·M&A 비즈니스 뉴스)
insert into public.sources
  (name, type, url, rss_url, is_active, crawl_interval_minutes,
   collection_method, trust_tier, "order", group_name)
select 'Bloomberg Technology', 'youtube_channel',
       'https://www.youtube.com/channel/UCrM7B7SL_g1edFOnmj-SDKg',
       'https://www.youtube.com/feeds/videos.xml?channel_id=UCrM7B7SL_g1edFOnmj-SDKg',
       true, 1440, 'youtube', 2, 9005, 'Bloomberg Technology'
where not exists (
  select 1 from public.sources
  where rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCrM7B7SL_g1edFOnmj-SDKg'
);

commit;

-- ─── 확인 쿼리 ────────────────────────────────────────────────────────────────
-- 1) 신규 등록 확인 (5개 row 기대)
-- select name, type, collection_method, is_active, "order", group_name
-- from public.sources
-- where type = 'youtube_channel' and "order" between 9001 and 9005
-- order by "order";

-- 2) 크롤러 트리거 후 채널별 적재 건수 확인
-- select s.name, count(c.id) as n
-- from public.sources s
-- left join public.contents c on c.source_id = s.id
-- where s.type = 'youtube_channel' and s."order" between 9001 and 9005
-- group by s.name
-- order by s.name;
