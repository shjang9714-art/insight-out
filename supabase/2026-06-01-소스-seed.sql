-- ============================================================
-- 초기 크롤링 소스 seed (P7) — 2026-06-01
-- #4 크롤러가 수집할 국내 IT매체 RSS 소스.
-- 실행: 수희 (Supabase SQL Editor) — 크롤러 첫 가동 전.
-- 검증: 각 rss_url 은 2026-06-01 기준 live + 당일 기사 포함 확인됨(Opus).
-- 멱등: rss_url 기준 not exists 가드 → 여러 번 실행해도 중복 INSERT 없음.
-- 참고: category 는 크롤러가 'news_site' → '뉴스'로 자동 지정. 소스엔 category 컬럼 없음.
--       crawl_interval_minutes=720(12h) → 매일 05:00 크론 틱에 항상 수집 대상.
-- ============================================================

begin;

-- 전자신문 (오늘의뉴스 전체)
insert into public.sources (name, type, url, rss_url, is_active, crawl_interval_minutes, "order")
select '전자신문', 'news_site', 'https://www.etnews.com', 'https://rss.etnews.com/Section901.xml', true, 720, 1
where not exists (select 1 from public.sources where rss_url = 'https://rss.etnews.com/Section901.xml');

-- 아이뉴스24 (IT)
insert into public.sources (name, type, url, rss_url, is_active, crawl_interval_minutes, "order")
select '아이뉴스24', 'news_site', 'https://www.inews24.com', 'https://www.inews24.com/rss/news_it.xml', true, 720, 2
where not exists (select 1 from public.sources where rss_url = 'https://www.inews24.com/rss/news_it.xml');

-- ZDNet Korea (전체기사)
insert into public.sources (name, type, url, rss_url, is_active, crawl_interval_minutes, "order")
select 'ZDNet Korea', 'news_site', 'https://zdnet.co.kr', 'https://feeds.feedburner.com/zdkorea', true, 720, 3
where not exists (select 1 from public.sources where rss_url = 'https://feeds.feedburner.com/zdkorea');

commit;

-- 확인용: select name, type, is_active, crawl_interval_minutes from public.sources order by "order";
