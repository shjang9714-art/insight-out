-- 웹인사이트 소스 시드 (수희 Supabase SQL Editor 실행)
-- 분류 원칙(David): 매일 발행 신문 = 뉴스(news_site), 비정기/주기적 배포(블로그·뉴스룸·연구소) = 웹인사이트(web_insight)
-- web_insight 도 news-site RSS 어댑터로 수집됨(rss_url 필요). collection_method='rss', trust_tier=1(관련도 게이트 적용 → B2B 무관 글 필터).
-- ⚠️ DB 구조 변경 없음(기존 sources 컬럼). rss_url 은 unique 제약 있음(중복 시 무시되거나 에러 → 이미 있으면 빼고 실행).

-- ── 1) RSS 정상 확인된 소스 (등록) ──────────────────────────────────────────
insert into public.sources (name, type, collection_method, url, rss_url, is_active, trust_tier, crawl_interval_minutes)
values
  ('AWS 코리아 블로그', 'web_insight', 'rss',
   'https://aws.amazon.com/ko/blogs/korea/',
   'https://aws.amazon.com/ko/blogs/korea/feed/', true, 1, 720),
  ('SK텔레콤 뉴스룸', 'web_insight', 'rss',
   'https://news.sktelecom.com/',
   'https://news.sktelecom.com/feed', true, 1, 720)
on conflict (rss_url) do nothing;

-- ── 2) (선택) 표준 RSS 없는 기관 — Google News 사이트검색 피드로 우회 등록 ──
--   LG CNS·SPRi·NIA·삼성SDS·U+ 블로그는 자체 RSS 없음.
--   아래는 Google News 의 site: 검색 RSS(불확실 — 코퍼레이트 블로그는 Google News 색인이 적어 수집 0일 수 있음).
--   등록 후 "지금 수집" 1회 → /admin/sources 의 ⚠️/수집 0 배지로 효과 확인, 0이면 비활성/삭제 권장.
--   원하면 아래 주석 해제 후 실행:
-- insert into public.sources (name, type, collection_method, url, rss_url, is_active, trust_tier, crawl_interval_minutes)
-- values
--   ('SPRi 소프트웨어정책연구소', 'web_insight', 'rss', 'https://spri.kr/',
--    'https://news.google.com/rss/search?q=site:spri.kr&hl=ko&gl=KR&ceid=KR:ko', true, 1, 1440),
--   ('NIA 한국지능정보사회진흥원', 'web_insight', 'rss', 'https://www.nia.or.kr/',
--    'https://news.google.com/rss/search?q=site:nia.or.kr&hl=ko&gl=KR&ceid=KR:ko', true, 1, 1440),
--   ('삼성SDS 인사이트', 'web_insight', 'rss', 'https://www.samsungsds.com/kr/insights/',
--    'https://news.google.com/rss/search?q=site:samsungsds.com&hl=ko&gl=KR&ceid=KR:ko', true, 1, 1440),
--   ('LG CNS 블로그', 'web_insight', 'rss', 'https://www.lgcns.com/',
--    'https://news.google.com/rss/search?q=site:lgcns.com&hl=ko&gl=KR&ceid=KR:ko', true, 1, 1440)
-- on conflict (rss_url) do nothing;

-- ── 3) 검증 ─────────────────────────────────────────────────────────────────
select name, type, rss_url, is_active from public.sources where type = 'web_insight' order by name;
