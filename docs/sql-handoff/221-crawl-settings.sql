-- 221 본문 최소 길이 어드민 설정 — crawl_settings 단일행 테이블
-- 핸드오프: 수희 → Supabase SQL Editor 실행. 멱등.
-- 목적: 크롤 수집 시 본문 최소 길이(미만이면 미수집)를 어드민이 조정. 크롤러가 서버에서 읽음.
--   미적용(42P01) 시 코드는 기본값 250으로 graceful 동작.
-- 관련: 지시서 221.

create table if not exists public.crawl_settings (
  id              boolean primary key default true check (id),   -- 단일행 강제
  min_body_length integer not null default 250,
  updated_at      timestamptz not null default now()
);

insert into public.crawl_settings (id) values (true) on conflict (id) do nothing;

-- updated_at 자동 갱신(공용 트리거 함수 set_updated_at 존재 시 재사용)
drop trigger if exists trg_crawl_settings_updated_at on public.crawl_settings;
create trigger trg_crawl_settings_updated_at
  before update on public.crawl_settings
  for each row execute function public.set_updated_at();

alter table public.crawl_settings enable row level security;

drop policy if exists "crawl_settings read all" on public.crawl_settings;
create policy "crawl_settings read all"
  on public.crawl_settings for select using (true);

drop policy if exists "crawl_settings admin write" on public.crawl_settings;
create policy "crawl_settings admin write"
  on public.crawl_settings for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.crawl_settings to anon, authenticated;

-- 확인:
-- select * from public.crawl_settings;
