-- ============================================================
-- TYPES
-- ============================================================

create type user_role as enum ('user', 'admin');
create type department as enum (
  'Enterprise사업부문',
  'SMB사업부문',
  '공공사업부문',
  '기술부문',
  '마케팅부문',
  '기타'
);
create type newsletter_frequency as enum ('daily', 'weekly', 'twice_weekly', 'none');


-- ============================================================
-- TABLES
-- ============================================================

create table public.users (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  name                 text not null default '',
  department           department not null default '기타',
  team                 text not null default '',
  position             text,
  role                 user_role not null default 'user',
  onboarding_completed boolean not null default false,
  content_filter_mode  text not null default 'all'
    check (content_filter_mode in ('my_services', 'all')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.user_services (
  user_id    uuid not null references public.users (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  is_pinned  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table public.newsletter_subscriptions (
  user_id          uuid primary key references public.users (id) on delete cascade,
  frequency        newsletter_frequency not null default 'weekly',
  is_active        boolean not null default true,
  newsletter_email text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_newsletter_subscriptions_updated_at
  before update on public.newsletter_subscriptions
  for each row execute function public.set_updated_at();


-- ============================================================
-- AUTO-CREATE USER ROW ON SIGN-UP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users                   enable row level security;
alter table public.services                enable row level security;
alter table public.user_services           enable row level security;
alter table public.newsletter_subscriptions enable row level security;

-- users
create policy "users: 본인 조회"
  on public.users for select
  using (auth.uid() = id);

create policy "users: 본인 추가"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users: 본인 수정"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "users: admin 전체 조회"
  on public.users for select
  using (public.is_admin());

-- services
create policy "services: 인증 사용자 조회"
  on public.services for select
  using (auth.role() = 'authenticated');

create policy "services: admin 관리"
  on public.services for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- user_services
create policy "user_services: 본인 조회"
  on public.user_services for select
  using (auth.uid() = user_id);

create policy "user_services: 본인 추가"
  on public.user_services for insert
  with check (auth.uid() = user_id);

create policy "user_services: 본인 수정"
  on public.user_services for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_services: 본인 삭제"
  on public.user_services for delete
  using (auth.uid() = user_id);

create policy "user_services: admin 전체 조회"
  on public.user_services for select
  using (public.is_admin());

-- newsletter_subscriptions
create policy "newsletter: 본인 조회"
  on public.newsletter_subscriptions for select
  using (auth.uid() = user_id);

create policy "newsletter: 본인 추가"
  on public.newsletter_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "newsletter: 본인 수정"
  on public.newsletter_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "newsletter: admin 전체 조회"
  on public.newsletter_subscriptions for select
  using (public.is_admin());


-- ============================================================
-- INITIAL SERVICES DATA
-- ============================================================

insert into public.services (name, description, icon, "order") values
  ('Connectivity',  '유선·무선 기업 네트워크 솔루션',      '🌐', 1),
  ('보안/클라우드',  '기업 보안 및 클라우드 인프라 서비스',  '🔒', 2),
  ('M2M',           'IoT·M2M 디바이스 연결 플랫폼',       '📡', 3),
  ('AICC',          'AI 기반 컨택센터 솔루션',             '🎧', 4),
  ('AIDC',          'AI 데이터센터 및 GPU 인프라',         '🖥️', 5),
  ('모빌리티',       '기업 모빌리티·차량 관리 서비스',      '🚗', 6),
  ('기업솔루션',     '그룹웨어·협업·업무 자동화 솔루션',    '⚙️', 7);


-- ============================================================
-- ============================================================
-- PHASE 1-B · 콘텐츠 도메인 (#1)
--   sources / keywords / contents / content_services /
--   content_keywords / youtube_videos / ai_reports /
--   ai_report_sources
-- ============================================================
-- ============================================================

-- ---------- TYPES ----------

-- 콘텐츠 8개 카테고리 (고정값 → enum)
create type content_category as enum (
  '뉴스',
  '가트너',
  'KRG',
  '웹인사이트',
  '오피니언',
  '뉴스레터',
  'AI보고서',
  '유튜브'
);

-- 수집 출처 유형
create type source_type as enum (
  'news_site',         -- 뉴스 사이트 (RSS/크롤링)
  'report_publisher',  -- 리서치 발행처 (가트너 / KRG / 웹인사이트)
  'opinion_channel',   -- 오피니언 채널 (Substack / Medium / 벤더 블로그)
  'newsletter',        -- 외부 뉴스레터 (뉴닉 / 어피티 등)
  'youtube_channel'    -- 유튜브 채널
);

-- AI 보고서 유형
create type ai_report_type as enum (
  '시장동향',
  '경쟁사분석',
  '키워드분석',
  '서비스리포트',
  '자유주제'
);

-- AI 보고서 생성 상태
create type ai_report_status as enum (
  'draft',       -- 작성 전(주제만 지정)
  'generating',  -- LLM 생성 중
  'completed',   -- 생성 완료
  'failed'       -- 생성 실패
);


-- ---------- TABLES ----------

-- 수집 출처 카탈로그 (결정 D)
create table public.sources (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  type                   source_type not null,
  url                    text,
  rss_url                text,
  is_active              boolean not null default true,
  crawl_interval_minutes integer,                -- null = 수동 업로드 / 비주기
  last_crawled_at        timestamptz,
  "order"                integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 키워드 카탈로그 (결정 E) — 트렌드 분석·경쟁사 추적용
create table public.keywords (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  service_id    uuid references public.services (id) on delete set null,  -- 서비스 카테고리 힌트(작업 #22)
  is_competitor boolean not null default false,                           -- 경쟁사 키워드(작업 #6)
  created_at    timestamptz not null default now()
);
-- 트렌드 집계 시 동일 키워드 중복 방지 (대소문자 무시)
create unique index keywords_name_key on public.keywords (lower(name));

-- 메인 콘텐츠 (뉴스 / 리포트 / 오피니언 / 뉴스레터) — 결정 A: 단일 테이블
create table public.contents (
  id                 uuid primary key default gen_random_uuid(),
  category           content_category not null,
  source_id          uuid references public.sources (id) on delete set null,
  title              text not null,
  title_original     text,                              -- 영문 원제(번역 시)
  summary_ko         text,                              -- 한국어 요약 (결정 F)
  body_original      text,                              -- 원문 본문 (결정 F)
  body_translated_ko text,                              -- 번역본 (결정 F)
  original_language  text not null default 'ko',        -- 'ko' | 'en' ...
  author             text,
  original_url       text,
  thumbnail_url      text,
  file_path          text,                              -- Supabase Storage 첨부 경로 (결정 G, 리포트 1:1)
  -- 중복 필터링 메타 (결정 H · 작업 #12 의 3단계)
  title_hash         text,                              -- 2단계: 정규화 제목 해시
  body_hash          text,                              -- 3단계: 본문 해시
  -- 임팩트 지표 (결정 I · UX 로드맵 대비)
  view_count         integer not null default 0,
  bookmark_count     integer not null default 0,        -- bookmarks 트리거로 동기화
  is_editor_pick     boolean not null default false,
  -- 상태·시각
  is_published       boolean not null default true,
  published_at       timestamptz,                       -- 원문 발행일
  collected_at       timestamptz not null default now(),-- 수집 시각
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- 전문 검색 벡터 — 트리거로 자동 관리 (제목 A · 요약 B · 번역 본문 C)
  search_vector      tsvector
);
-- 1단계 중복 필터: 원문 URL 유일성 (null 은 허용 → 부분 유니크)
create unique index contents_original_url_key on public.contents (original_url) where original_url is not null;
create index contents_category_idx        on public.contents (category);
create index contents_source_idx          on public.contents (source_id);
create index contents_published_at_idx    on public.contents (published_at desc);
create index contents_title_hash_idx      on public.contents (title_hash) where title_hash is not null;
create index contents_body_hash_idx       on public.contents (body_hash)  where body_hash is not null;
create index contents_search_vector_idx   on public.contents using gin(search_vector);

-- 콘텐츠 ↔ 서비스 (N:M) — 결정 C: content_services
create table public.content_services (
  content_id uuid not null references public.contents (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, service_id)
);
create index content_services_service_idx on public.content_services (service_id);

-- 콘텐츠 ↔ 키워드 (N:M) — 결정 E
create table public.content_keywords (
  content_id uuid not null references public.contents (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, keyword_id)
);
create index content_keywords_keyword_idx on public.content_keywords (keyword_id);

-- 유튜브 영상 (결정 A: 별도 테이블 — 영상 메타 구조 상이)
create table public.youtube_videos (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references public.sources (id) on delete set null,  -- youtube_channel 소스
  video_id         text not null,                     -- YouTube 영상 ID
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

-- AI 보고서 (사용자 생성) — 결정 A: 별도 테이블
create table public.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  type          ai_report_type not null,
  status        ai_report_status not null default 'draft',
  title         text not null default '',
  prompt        text,                                  -- 사용자 요청/주제
  body_md       text,                                  -- 생성된 보고서 본문(markdown)
  file_path     text,                                  -- 내보낸 파일(PDF 등) Storage 경로
  error_message text,                                  -- status='failed' 시 사유
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ai_reports_user_idx on public.ai_reports (user_id);

-- AI 보고서 ↔ 참조 콘텐츠 (N:M, 결정 J) — 다형 참조: contents | youtube_videos 중 하나
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
-- ============================================================
-- PHASE 1-B · 북마크·아카이빙 도메인 (#2)
--   bookmarks / archives / archive_items
-- ============================================================
-- ============================================================

-- 단순 즐겨찾기 (결정 K) — 다형 참조: contents | youtube_videos
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
-- 같은 항목 중복 북마크 방지(유저별)
create unique index bookmarks_user_content_key
  on public.bookmarks (user_id, content_id) where content_id is not null;
create unique index bookmarks_user_youtube_key
  on public.bookmarks (user_id, youtube_video_id) where youtube_video_id is not null;

-- 사용자 컬렉션 (결정 K) — 메일 발송 단위
create table public.archives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index archives_user_idx on public.archives (user_id);

-- 아카이브 ↔ 콘텐츠 (N:M, 결정 K) — 다형 참조: contents | youtube_videos
create table public.archive_items (
  archive_id       uuid not null references public.archives (id) on delete cascade,
  content_id       uuid references public.contents (id) on delete cascade,
  youtube_video_id uuid references public.youtube_videos (id) on delete cascade,
  note             text,                              -- 메일 발송용 사용자 메모
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


-- ============================================================
-- UPDATED_AT 트리거 (신규 테이블)
-- ============================================================

create trigger set_sources_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create trigger set_contents_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();


-- ============================================================
-- 전문 검색 벡터 자동 갱신 트리거 (contents)
-- 'simple' 사전: 한국어 불용어·어간 처리 없이 토큰 그대로 사용 — 한국어에 적합
-- ============================================================

create or replace function public.contents_search_vector_update()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')),              'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary_ko, '')),         'B') ||
    setweight(to_tsvector('simple', coalesce(new.body_translated_ko, '')), 'C');
  return new;
end;
$$;

drop trigger if exists contents_search_vector_trigger on public.contents;
create trigger contents_search_vector_trigger
  before insert or update on public.contents
  for each row execute function public.contents_search_vector_update();


create trigger set_youtube_videos_updated_at
  before update on public.youtube_videos
  for each row execute function public.set_updated_at();

create trigger set_ai_reports_updated_at
  before update on public.ai_reports
  for each row execute function public.set_updated_at();

create trigger set_archives_updated_at
  before update on public.archives
  for each row execute function public.set_updated_at();


-- ============================================================
-- bookmark_count 동기화 트리거 (contents 대상 북마크만)
-- ============================================================

create or replace function public.sync_content_bookmark_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') and new.content_id is not null then
    update public.contents
      set bookmark_count = bookmark_count + 1
      where id = new.content_id;
  elsif (tg_op = 'DELETE') and old.content_id is not null then
    update public.contents
      set bookmark_count = greatest(bookmark_count - 1, 0)
      where id = old.content_id;
  end if;
  return null;
end;
$$;

create trigger sync_bookmark_count_ins
  after insert on public.bookmarks
  for each row execute function public.sync_content_bookmark_count();

create trigger sync_bookmark_count_del
  after delete on public.bookmarks
  for each row execute function public.sync_content_bookmark_count();


-- ============================================================
-- ROW LEVEL SECURITY (신규 테이블)
-- ============================================================

alter table public.sources           enable row level security;
alter table public.keywords          enable row level security;
alter table public.contents          enable row level security;
alter table public.content_services  enable row level security;
alter table public.content_keywords  enable row level security;
alter table public.youtube_videos    enable row level security;
alter table public.ai_reports        enable row level security;
alter table public.ai_report_sources enable row level security;
alter table public.bookmarks         enable row level security;
alter table public.archives          enable row level security;
alter table public.archive_items     enable row level security;

-- ---------- 공개 카탈로그·콘텐츠: 인증 사용자 조회 / admin 관리 ----------
-- (크롤러는 service_role 키로 RLS 우회하여 적재)

create policy "sources: 인증 사용자 조회"
  on public.sources for select using (auth.role() = 'authenticated');
create policy "sources: admin 관리"
  on public.sources for all using (public.is_admin()) with check (public.is_admin());

create policy "keywords: 인증 사용자 조회"
  on public.keywords for select using (auth.role() = 'authenticated');
create policy "keywords: admin 관리"
  on public.keywords for all using (public.is_admin()) with check (public.is_admin());

create policy "contents: 인증 사용자 조회"
  on public.contents for select using (auth.role() = 'authenticated' and is_published);
create policy "contents: admin 전체 조회"
  on public.contents for select using (public.is_admin());
create policy "contents: admin 관리"
  on public.contents for all using (public.is_admin()) with check (public.is_admin());

create policy "content_services: 인증 사용자 조회"
  on public.content_services for select using (auth.role() = 'authenticated');
create policy "content_services: admin 관리"
  on public.content_services for all using (public.is_admin()) with check (public.is_admin());

create policy "content_keywords: 인증 사용자 조회"
  on public.content_keywords for select using (auth.role() = 'authenticated');
create policy "content_keywords: admin 관리"
  on public.content_keywords for all using (public.is_admin()) with check (public.is_admin());

create policy "youtube_videos: 인증 사용자 조회"
  on public.youtube_videos for select using (auth.role() = 'authenticated');
create policy "youtube_videos: admin 관리"
  on public.youtube_videos for all using (public.is_admin()) with check (public.is_admin());

-- ---------- AI 보고서: 본인 데이터 + admin 전체 ----------

create policy "ai_reports: 본인 조회"
  on public.ai_reports for select using (auth.uid() = user_id);
create policy "ai_reports: 본인 추가"
  on public.ai_reports for insert with check (auth.uid() = user_id);
create policy "ai_reports: 본인 수정"
  on public.ai_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_reports: 본인 삭제"
  on public.ai_reports for delete using (auth.uid() = user_id);
create policy "ai_reports: admin 전체 조회"
  on public.ai_reports for select using (public.is_admin());

create policy "ai_report_sources: 본인 조회"
  on public.ai_report_sources for select
  using (exists (select 1 from public.ai_reports r
                 where r.id = ai_report_id and r.user_id = auth.uid()));
create policy "ai_report_sources: 본인 추가"
  on public.ai_report_sources for insert
  with check (exists (select 1 from public.ai_reports r
                      where r.id = ai_report_id and r.user_id = auth.uid()));
create policy "ai_report_sources: 본인 삭제"
  on public.ai_report_sources for delete
  using (exists (select 1 from public.ai_reports r
                 where r.id = ai_report_id and r.user_id = auth.uid()));

-- ---------- 북마크: 본인 데이터 ----------

create policy "bookmarks: 본인 조회"
  on public.bookmarks for select using (auth.uid() = user_id);
create policy "bookmarks: 본인 추가"
  on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "bookmarks: 본인 삭제"
  on public.bookmarks for delete using (auth.uid() = user_id);

-- ---------- 아카이브: 본인 데이터 ----------

create policy "archives: 본인 조회"
  on public.archives for select using (auth.uid() = user_id);
create policy "archives: 본인 추가"
  on public.archives for insert with check (auth.uid() = user_id);
create policy "archives: 본인 수정"
  on public.archives for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "archives: 본인 삭제"
  on public.archives for delete using (auth.uid() = user_id);

-- archive_items: 소속 아카이브 소유권으로 판정
create policy "archive_items: 본인 조회"
  on public.archive_items for select
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 추가"
  on public.archive_items for insert
  with check (exists (select 1 from public.archives a
                      where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 수정"
  on public.archive_items for update
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));
create policy "archive_items: 본인 삭제"
  on public.archive_items for delete
  using (exists (select 1 from public.archives a
                 where a.id = archive_id and a.user_id = auth.uid()));


-- ============================================================
-- MIGRATION (기존 배포 인스턴스에 직접 실행)
-- 새 인스턴스는 위 CREATE TABLE 정의로 자동 적용되므로 불필요
-- ============================================================

-- newsletter_frequency enum 에 twice_weekly 추가
-- alter type newsletter_frequency add value 'twice_weekly';

-- users 테이블에 content_filter_mode 추가
-- alter table public.users
--   add column if not exists content_filter_mode text not null default 'all'
--   check (content_filter_mode in ('my_services', 'all'));

-- newsletter_subscriptions 에 newsletter_email 추가
-- alter table public.newsletter_subscriptions
--   add column if not exists newsletter_email text;
