-- ============================================================================
-- 추천 피드 스키마 — user_preferences / user_service_prefs / content_views
-- ----------------------------------------------------------------------------
-- 목적: 추천 피드용 사용자 선호(키워드/서비스) 및 콘텐츠 열람 로그 적재.
-- 실행: Supabase SQL Editor 1회 실행. CLI 사용 안 함.
--
-- [사전 확인 결과 — 지시서(02) 가정과 실제 스키마 차이, 반영 내용]
--   1. keywords.id / contents.id 는 BIGINT 가 아니라 uuid (gen_random_uuid()).
--      → user_preferences.keyword_id, content_views.content_id 를 uuid 로 작성.
--   2. 신규 테이블 자체의 PK도 지시서는 BIGSERIAL 을 지정했으나, 기존 스키마의
--      모든 테이블이 uuid PK(gen_random_uuid()) 컨벤션을 사용 중 (AGENTS.md §19.5
--      "기존 코드 스타일을 따라가기"). 일관성을 위해 uuid PK 로 작성함.
--      → 이에 따라 "시퀀스 GRANT" 항목은 해당 없음(시퀀스가 없음).
--   3. user_id FK 대상은 지시서의 auth.users(id) 가 아니라 public.users(id).
--      프로젝트 전반에서 사용자 소유 데이터는 항상 public.users 를 참조함
--      (public.users.id 가 auth.users(id) 를 참조하는 미러 테이블이므로 동일 효과).
--   4. contents 테이블에는 "vertical" TEXT 컬럼이 존재하지 않음. 동일 개념은
--      public.services 테이블(Connectivity/AICC 등 7개, uuid PK)로 모델링되어
--      있고 content_services / user_services 조인 테이블로 연결됨.
--      → user_service_prefs.vertical TEXT 대신 service_id uuid
--        references public.services(id) 로 작성. (테이블명은 지시서대로
--        "추천 가중치"라는 별도 목적을 가지므로 user_services 와는 구분 유지)
--   5. content_keywords 는 keyword_id uuid 컬럼을 사용 중 → 1번과 동일하게 반영.
--
-- [검수 보완 반영]
--   ① user_service_prefs 는 user_preferences와 동일 패턴 유지
--      (updated_at + source + set_updated_at 트리거).
--   ② public.users.feed_onboarding_skipped 컬럼 추가 (하단 섹션 참고).
-- ============================================================================

-- ============================================================================
-- 1) user_preferences — 사용자별 키워드 선호도
-- ============================================================================

create table public.user_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  weight     numeric(5,2) not null default 1.0,
  source     text not null check (source in ('onboarding', 'behavioral')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, keyword_id)
);

create index user_preferences_user_idx on public.user_preferences (user_id);

create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2) user_service_prefs — 사용자별 서비스(버티컬) 선호
-- ============================================================================

create table public.user_service_prefs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  weight     numeric(5,2) not null default 1.0,
  source     text not null check (source in ('onboarding', 'behavioral')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, service_id)
);

create trigger set_user_service_prefs_updated_at
  before update on public.user_service_prefs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) content_views — 콘텐츠 열람 로그
-- ============================================================================

create table public.content_views (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  content_id    uuid not null references public.contents (id) on delete cascade,
  viewed_at     timestamptz not null default now(),
  dwell_seconds integer not null default 0
);

create index content_views_user_viewed_idx on public.content_views (user_id, viewed_at desc);
create index content_views_content_idx on public.content_views (content_id);

-- ============================================================================
-- RLS — 본인 데이터만 조회/관리
-- ============================================================================

alter table public.user_preferences   enable row level security;
alter table public.user_service_prefs enable row level security;
alter table public.content_views      enable row level security;

create policy "own_user_preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own_user_service_prefs"
  on public.user_service_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own_content_views"
  on public.content_views for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- GRANT — authenticated 만 허용 (anon 부여 안 함)
-- ============================================================================

grant select, insert, update, delete on table public.user_preferences   to authenticated;
grant select, insert, update, delete on table public.user_service_prefs to authenticated;
grant select, insert, update, delete on table public.content_views      to authenticated;

-- 참고: PK 를 uuid(gen_random_uuid())로 작성해 시퀀스가 없으므로
-- "시퀀스 GRANT USAGE" 대상 없음 (사전 확인 결과 2번 참고).

-- ============================================================================
-- users — 피드 추천 온보딩 스킵 여부
-- ----------------------------------------------------------------------------
-- 피드 추천 온보딩 스킵 여부. true면 트렌딩 위주 fallback 피드 노출.
-- '선택 완료'는 user_preferences에서 도출하므로 별도 컬럼 불필요.
-- ============================================================================

alter table public.users
  add column if not exists feed_onboarding_skipped boolean not null default false;
