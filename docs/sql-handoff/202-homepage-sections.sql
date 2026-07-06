-- 202 공개 홈 위젯 구성 — homepage_sections 테이블
-- 핸드오프: 수희 → Supabase SQL Editor 실행. 멱등(재실행 안전).
-- 목적: 공개 홈(/dashboard) 섹션의 노출 여부·순서를 어드민이 제어하도록 저장.
-- 관련: 지시서 202. 코드는 42P01(테이블 없음) graceful → SQL 미적용 시 현행 기본 레이아웃 유지.
-- 주의: 이건 "전 방문자에게 적용"되는 레이아웃 설정이라 DB 필요(201 어드민 외관과 달리 개인 취향 아님).

-- 1) 테이블
create table if not exists public.homepage_sections (
  section_key text primary key,
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

comment on table public.homepage_sections is '공개 홈(/dashboard) 섹션 노출·순서 구성. section_key 는 코드 레지스트리(HOME_SECTION_REGISTRY)와 1:1.';

-- 2) updated_at 자동 갱신 트리거 (set_updated_at() 는 스키마에 이미 존재)
drop trigger if exists trg_homepage_sections_updated_at on public.homepage_sections;
create trigger trg_homepage_sections_updated_at
  before update on public.homepage_sections
  for each row execute function public.set_updated_at();

-- 3) RLS: 읽기=전체 허용(레이아웃은 비민감), 쓰기=어드민만
alter table public.homepage_sections enable row level security;

drop policy if exists "homepage_sections read all" on public.homepage_sections;
create policy "homepage_sections read all"
  on public.homepage_sections for select
  using (true);

drop policy if exists "homepage_sections admin write" on public.homepage_sections;
create policy "homepage_sections admin write"
  on public.homepage_sections for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4) 권한: 읽기는 anon/authenticated(공개 홈이 읽음), 쓰기·전체는 service_role
grant select on table public.homepage_sections to anon, authenticated;
grant select, insert, update, delete on table public.homepage_sections to service_role;

-- 5) 시드 — 현행 하드코딩 6섹션(dashboard/page.tsx 렌더 순서 그대로). 이미 있으면 유지(멱등).
insert into public.homepage_sections (section_key, enabled, sort_order) values
  ('personalization_nudge', true, 10),
  ('visit_delta',           true, 20),
  ('suggested_questions',   true, 30),
  ('issue_signals',         true, 40),
  ('briefing_highlights',   true, 50),
  ('feed_slot',             true, 60)
on conflict (section_key) do nothing;

-- 확인용:
-- select section_key, enabled, sort_order from public.homepage_sections order by sort_order;
