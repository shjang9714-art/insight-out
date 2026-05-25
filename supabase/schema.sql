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
create type newsletter_frequency as enum ('daily', 'weekly', 'none');


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
  user_id    uuid primary key references public.users (id) on delete cascade,
  frequency  newsletter_frequency not null default 'weekly',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  values (new.id, new.email);
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

create policy "user_services: 본인 삭제"
  on public.user_services for delete
  using (auth.uid() = user_id);

-- newsletter_subscriptions
create policy "newsletter: 본인 조회"
  on public.newsletter_subscriptions for select
  using (auth.uid() = user_id);

create policy "newsletter: 본인 추가/수정"
  on public.newsletter_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "newsletter: 본인 수정"
  on public.newsletter_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- INITIAL SERVICES DATA
-- ============================================================

insert into public.services (name, description, icon, "order") values
  ('STAGE',       'Enterprise 영업 관리 플랫폼',       '🏢', 1),
  ('BizWork',     'SMB 고객 업무 자동화 솔루션',        '⚙️', 2),
  ('GovLink',     '공공기관 전자문서 연계 서비스',       '🏛️', 3),
  ('CloudOps',    '클라우드 인프라 운영 관리',           '☁️', 4),
  ('DataBridge',  '데이터 통합 및 분석 플랫폼',         '📊', 5),
  ('SecureVault', '기업 보안 및 접근 제어 솔루션',      '🔒', 6),
  ('ConnectAPI',  'API 연동 및 통합 관리 서비스',       '🔗', 7),
  ('InsightAds',  '마케팅 퍼포먼스 분석 대시보드',      '📈', 8);
