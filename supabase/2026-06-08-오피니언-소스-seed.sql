-- 오피니언 채널 소스 등록 (#43)
-- rss-parser 기준 파싱 확인된 RSS/Atom 피드만 활성 등록한다.
-- 보류: Ericsson Blog(403), a16z(404)

with incoming (name, url, rss_url, sort_order) as (
  values
    ('Cloudflare Blog', 'https://blog.cloudflare.com/', 'https://blog.cloudflare.com/rss/', 1),
    ('Google Online Security Blog', 'https://security.googleblog.com/', 'https://security.googleblog.com/feeds/posts/default', 2),
    ('Krebs on Security', 'https://krebsonsecurity.com/', 'https://krebsonsecurity.com/feed/', 3),
    ('AWS News Blog', 'https://aws.amazon.com/blogs/aws/', 'https://aws.amazon.com/blogs/aws/feed/', 4),
    ('Google Cloud Blog', 'https://cloudblog.withgoogle.com/', 'https://cloudblog.withgoogle.com/rss/', 5),
    ('Microsoft Azure Blog', 'https://azure.microsoft.com/en-us/blog/', 'https://azure.microsoft.com/en-us/blog/feed/', 6),
    ('Last Week in AWS (Corey Quinn)', 'https://www.lastweekinaws.com/blog/', 'https://www.lastweekinaws.com/blog/feed/', 7),
    ('Platformonomics (Charles Fitzgerald)', 'https://platformonomics.com/', 'https://platformonomics.com/feed/', 8),
    ('Cisco Blogs', 'https://blogs.cisco.com/', 'https://blogs.cisco.com/feed', 9),
    ('RCR Wireless News', 'https://www.rcrwireless.com/', 'https://www.rcrwireless.com/feed', 10),
    ('STL Partners', 'https://stlpartners.com/', 'https://stlpartners.com/feed/', 11),
    ('Benedict Evans', 'https://www.ben-evans.com/', 'https://www.ben-evans.com/benedictevans?format=rss', 12)
)
update public.sources s
set name = i.name,
    type = 'opinion_channel'::public.source_type,
    url = i.url,
    is_active = true,
    crawl_interval_minutes = 10080,
    updated_at = now()
from incoming i
where s.rss_url = i.rss_url;

with incoming (name, url, rss_url, sort_order) as (
  values
    ('Cloudflare Blog', 'https://blog.cloudflare.com/', 'https://blog.cloudflare.com/rss/', 1),
    ('Google Online Security Blog', 'https://security.googleblog.com/', 'https://security.googleblog.com/feeds/posts/default', 2),
    ('Krebs on Security', 'https://krebsonsecurity.com/', 'https://krebsonsecurity.com/feed/', 3),
    ('AWS News Blog', 'https://aws.amazon.com/blogs/aws/', 'https://aws.amazon.com/blogs/aws/feed/', 4),
    ('Google Cloud Blog', 'https://cloudblog.withgoogle.com/', 'https://cloudblog.withgoogle.com/rss/', 5),
    ('Microsoft Azure Blog', 'https://azure.microsoft.com/en-us/blog/', 'https://azure.microsoft.com/en-us/blog/feed/', 6),
    ('Last Week in AWS (Corey Quinn)', 'https://www.lastweekinaws.com/blog/', 'https://www.lastweekinaws.com/blog/feed/', 7),
    ('Platformonomics (Charles Fitzgerald)', 'https://platformonomics.com/', 'https://platformonomics.com/feed/', 8),
    ('Cisco Blogs', 'https://blogs.cisco.com/', 'https://blogs.cisco.com/feed', 9),
    ('RCR Wireless News', 'https://www.rcrwireless.com/', 'https://www.rcrwireless.com/feed', 10),
    ('STL Partners', 'https://stlpartners.com/', 'https://stlpartners.com/feed/', 11),
    ('Benedict Evans', 'https://www.ben-evans.com/', 'https://www.ben-evans.com/benedictevans?format=rss', 12)
),
base_order as (
  select coalesce(max("order"), 0) as value from public.sources
)
insert into public.sources (
  name,
  type,
  url,
  rss_url,
  is_active,
  crawl_interval_minutes,
  "order"
)
select
  i.name,
  'opinion_channel'::public.source_type,
  i.url,
  i.rss_url,
  true,
  10080,
  base_order.value + i.sort_order
from incoming i
cross join base_order
where not exists (
  select 1 from public.sources s where s.rss_url = i.rss_url
);

-- 확인:
-- select name, type, rss_url, is_active, crawl_interval_minutes
-- from public.sources
-- where type = 'opinion_channel'
-- order by "order", name;
