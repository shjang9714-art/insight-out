-- ============================================================
-- Insight Out — Supabase 복구 스크립트
-- 언제 사용: 온보딩 저장 오류, RLS 오류, 트리거 문제가 발생할 때
-- 방법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣기 후 실행
-- 안전: 멱등성 보장 — 이미 있는 정책/트리거는 DROP 후 재생성
-- ============================================================


-- ============================================================
-- 1. ENUM 타입 (없으면 생성)
-- ============================================================

do $$ begin
  create type user_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type department as enum (
    'Enterprise사업부문',
    'SMB사업부문',
    '공공사업부문',
    '기술부문',
    '마케팅부문',
    '기타'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type newsletter_frequency as enum ('daily', 'weekly', 'none');
exception when duplicate_object then null;
end $$;


-- ============================================================
-- 2. 테이블 (없으면 생성 — 있어도 컬럼 누락 체크)
-- ============================================================

create table if not exists public.users (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  name                 text not null default '',
  department           department not null default '기타',
  team                 text not null default '',
  position             text,
  role                 user_role not null default 'user',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- onboarding_completed 컬럼이 없는 구버전 DB 에 추가
alter table public.users
  add column if not exists onboarding_completed boolean not null default false;

alter table public.users
  add column if not exists name text not null default '';

alter table public.users
  add column if not exists department department not null default '기타';

alter table public.users
  add column if not exists team text not null default '';

alter table public.users
  add column if not exists position text;

alter table public.users
  add column if not exists role user_role not null default 'user';

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_services (
  user_id    uuid not null references public.users (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  is_pinned  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table if not exists public.newsletter_subscriptions (
  user_id    uuid primary key references public.users (id) on delete cascade,
  frequency  newsletter_frequency not null default 'weekly',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 3. RLS 활성화
-- ============================================================

alter table public.users                    enable row level security;
alter table public.services                 enable row level security;
alter table public.user_services            enable row level security;
alter table public.newsletter_subscriptions enable row level security;


-- ============================================================
-- 4. 함수: is_admin()
-- ============================================================

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


-- ============================================================
-- 5. 함수 + 트리거: set_updated_at
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists set_newsletter_subscriptions_updated_at on public.newsletter_subscriptions;
create trigger set_newsletter_subscriptions_updated_at
  before update on public.newsletter_subscriptions
  for each row execute function public.set_updated_at();


-- ============================================================
-- 6. 함수 + 트리거: handle_new_user (로그인 시 users row 자동 생성)
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 7. RLS 정책 재설정 — users
-- ============================================================

drop policy if exists "users: 본인 조회"         on public.users;
drop policy if exists "users: 본인 추가"         on public.users;
drop policy if exists "users: 본인 수정"         on public.users;
drop policy if exists "users: admin 전체 조회"   on public.users;

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

create policy "users: admin 전체 조회"
  on public.users for select
  using (public.is_admin());


-- ============================================================
-- 8. RLS 정책 재설정 — services
-- ============================================================

drop policy if exists "services: 인증 사용자 조회" on public.services;
drop policy if exists "services: admin 관리"       on public.services;

create policy "services: 인증 사용자 조회"
  on public.services for select
  using (auth.role() = 'authenticated');

create policy "services: admin 관리"
  on public.services for all
  using (public.is_admin());


-- ============================================================
-- 9. RLS 정책 재설정 — user_services
-- ============================================================

drop policy if exists "user_services: 본인 조회" on public.user_services;
drop policy if exists "user_services: 본인 추가" on public.user_services;
drop policy if exists "user_services: 본인 수정" on public.user_services;
drop policy if exists "user_services: 본인 삭제" on public.user_services;

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


-- ============================================================
-- 10. RLS 정책 재설정 — newsletter_subscriptions
-- ============================================================

drop policy if exists "newsletter: 본인 조회"       on public.newsletter_subscriptions;
drop policy if exists "newsletter: 본인 추가/수정"   on public.newsletter_subscriptions;
drop policy if exists "newsletter: 본인 추가"        on public.newsletter_subscriptions;
drop policy if exists "newsletter: 본인 수정"        on public.newsletter_subscriptions;
drop policy if exists "newsletter: admin 전체 조회"  on public.newsletter_subscriptions;

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
-- 11. services 시드 데이터 (없으면 삽입)
-- ============================================================

insert into public.services (name, description, icon, "order") values
  ('STAGE',       'Enterprise 영업 관리 플랫폼',       '🏢', 1),
  ('BizWork',     'SMB 고객 업무 자동화 솔루션',        '⚙️', 2),
  ('GovLink',     '공공기관 전자문서 연계 서비스',       '🏛️', 3),
  ('CloudOps',    '클라우드 인프라 운영 관리',           '☁️', 4),
  ('DataBridge',  '데이터 통합 및 분석 플랫폼',         '📊', 5),
  ('SecureVault', '기업 보안 및 접근 제어 솔루션',      '🔒', 6),
  ('ConnectAPI',  'API 연동 및 통합 관리 서비스',       '🔗', 7),
  ('InsightAds',  '마케팅 퍼포먼스 분석 대시보드',      '📈', 8)
on conflict do nothing;
