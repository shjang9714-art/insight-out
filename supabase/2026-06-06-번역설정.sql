-- 번역 공급자 활성 설정
-- API 키는 저장하지 않으며 Vercel 환경변수로만 관리
-- 수희 실행 대기

create table if not exists public.translation_settings (
  provider text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.translation_settings enable row level security;

revoke all on table public.translation_settings from anon, authenticated;
grant select, insert, update on table public.translation_settings to service_role;

insert into public.translation_settings (provider, enabled)
values
  ('deepl', true),
  ('papago', true),
  ('google', true)
on conflict (provider) do nothing;
