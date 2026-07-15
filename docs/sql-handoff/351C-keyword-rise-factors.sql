-- 지시서 351-C — 키워드 상승 요인 저장 테이블
-- 수희 적용용. Supabase SQL Editor에서 전체 실행하세요.

create table if not exists public.keyword_rise_factors (
  keyword       text primary key
    check (keyword = lower(btrim(keyword)) and keyword <> ''),
  display_name  text not null,
  overview      text not null default '',
  factors       jsonb not null default '[]'::jsonb
    check (jsonb_typeof(factors) = 'array'),
  generated_at  timestamptz not null default now(),
  status        text not null default 'draft'
    check (status in ('draft', 'published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_keyword_rise_factors_updated_at on public.keyword_rise_factors;
create trigger set_keyword_rise_factors_updated_at
  before update on public.keyword_rise_factors
  for each row execute function public.set_updated_at();

alter table public.keyword_rise_factors enable row level security;

drop policy if exists "keyword_rise_factors: 인증 사용자 조회" on public.keyword_rise_factors;
create policy "keyword_rise_factors: 인증 사용자 조회"
  on public.keyword_rise_factors for select
  using (auth.role() = 'authenticated');

grant select on public.keyword_rise_factors to authenticated;
grant select, insert, update on public.keyword_rise_factors to service_role;
