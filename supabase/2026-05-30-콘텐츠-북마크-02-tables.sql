-- ============================================================
-- [수희 실행용] Phase 1-B · STEP 2/4 — 테이블 + 인덱스
-- 적용처: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 선행조건: 01-types.sql 완료
-- 다음 단계: 03-triggers.sql
-- ============================================================


-- ============================================================
-- 콘텐츠 도메인
--   sources / keywords / contents / content_services /
--   content_keywords / youtube_videos / ai_reports / ai_report_sources
-- ============================================================

create table public.sources (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  type                   source_type not null,
  url                    text,
  rss_url                text,
  is_active              boolean not null default true,
  crawl_interval_minutes integer,
  last_crawled_at        timestamptz,
  "order"                integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.keywords (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  service_id    uuid references public.services (id) on delete set null,
  is_competitor boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index keywords_name_key on public.keywords (lower(name));

create table public.contents (
  id                 uuid primary key default gen_random_uuid(),
  category           content_category not null,
  source_id          uuid references public.sources (id) on delete set null,
  title              text not null,
  title_original     text,
  summary_ko         text,
  body_original      text,
  body_translated_ko text,
  original_language  text not null default 'ko',
  author             text,
  original_url       text,
  thumbnail_url      text,
  file_path          text,
  title_hash         text,
  body_hash          text,
  view_count         integer not null default 0,
  bookmark_count     integer not null default 0,
  is_editor_pick     boolean not null default false,
  is_published       boolean not null default true,
  published_at       timestamptz,
  collected_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index contents_original_url_key on public.contents (original_url) where original_url is not null;
create index contents_category_idx     on public.contents (category);
create index contents_source_idx       on public.contents (source_id);
create index contents_published_at_idx on public.contents (published_at desc);
create index contents_title_hash_idx   on public.contents (title_hash) where title_hash is not null;
create index contents_body_hash_idx    on public.contents (body_hash)  where body_hash is not null;

create table public.content_services (
  content_id uuid not null references public.contents (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, service_id)
);
create index content_services_service_idx on public.content_services (service_id);

create table public.content_keywords (
  content_id uuid not null references public.contents (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, keyword_id)
);
create index content_keywords_keyword_idx on public.content_keywords (keyword_id);

create table public.youtube_videos (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references public.sources (id) on delete set null,
  video_id         text not null,
  title            text not null,
  channel_name     text not null,
  channel_id       text,
  description      text,
  thumbnail_url    text,
  duration_seconds integer,
  view_count       integer,
  published_at     timestamptz,
  collected_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index youtube_videos_video_id_key on public.youtube_videos (video_id);
create index youtube_videos_source_idx       on public.youtube_videos (source_id);
create index youtube_videos_published_at_idx on public.youtube_videos (published_at desc);

create table public.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  type          ai_report_type not null,
  status        ai_report_status not null default 'draft',
  title         text not null default '',
  prompt        text,
  body_md       text,
  file_path     text,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ai_reports_user_idx on public.ai_reports (user_id);

create table public.ai_report_sources (
  ai_report_id     uuid not null references public.ai_reports (id) on delete cascade,
  content_id       uuid references public.contents (id) on delete cascade,
  youtube_video_id uuid references public.youtube_videos (id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint ai_report_sources_one_item check (
    (content_id is not null)::int + (youtube_video_id is not null)::int = 1
  )
);
create unique index ai_report_sources_content_key
  on public.ai_report_sources (ai_report_id, content_id) where content_id is not null;
create unique index ai_report_sources_youtube_key
  on public.ai_report_sources (ai_report_id, youtube_video_id) where youtube_video_id is not null;


-- ============================================================
-- 북마크·아카이빙 도메인
--   bookmarks / archives / archive_items
-- ============================================================

create table public.bookmarks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  content_id       uuid references public.contents (id) on delete cascade,
  youtube_video_id uuid references public.youtube_videos (id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint bookmarks_one_item check (
    (content_id is not null)::int + (youtube_video_id is not null)::int = 1
  )
);
create unique index bookmarks_user_content_key
  on public.bookmarks (user_id, content_id) where content_id is not null;
create unique index bookmarks_user_youtube_key
  on public.bookmarks (user_id, youtube_video_id) where youtube_video_id is not null;

create table public.archives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index archives_user_idx on public.archives (user_id);

create table public.archive_items (
  archive_id       uuid not null references public.archives (id) on delete cascade,
  content_id       uuid references public.contents (id) on delete cascade,
  youtube_video_id uuid references public.youtube_videos (id) on delete cascade,
  note             text,
  "order"          integer not null default 0,
  added_at         timestamptz not null default now(),
  constraint archive_items_one_item check (
    (content_id is not null)::int + (youtube_video_id is not null)::int = 1
  )
);
create unique index archive_items_content_key
  on public.archive_items (archive_id, content_id) where content_id is not null;
create unique index archive_items_youtube_key
  on public.archive_items (archive_id, youtube_video_id) where youtube_video_id is not null;
