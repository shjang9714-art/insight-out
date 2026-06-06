-- 영문 콘텐츠 번역 공급자별 월간 사용량
-- 수희 실행 대기

create table if not exists public.translation_usage (
  provider text not null,
  period text not null,
  chars bigint not null default 0 check (chars >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

alter table public.translation_usage enable row level security;

revoke all on table public.translation_usage from anon, authenticated;
grant select, insert, update on table public.translation_usage to service_role;

create or replace function public.increment_translation_usage(
  p_provider text,
  p_period text,
  p_chars bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.translation_usage (period, provider, chars, updated_at)
  values (p_period, p_provider, greatest(p_chars, 0), now())
  on conflict (period, provider) do update
  set chars = public.translation_usage.chars + excluded.chars,
      updated_at = now();
$$;

revoke all on function public.increment_translation_usage(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.increment_translation_usage(text, text, bigint)
  to service_role;
