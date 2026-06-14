-- ============================================================
-- 지시서 54 — LLM 게이트웨이 / 키 풀 사용량 테이블
-- 수희 실행: Supabase Dashboard → SQL Editor 에서 1회 실행
-- ============================================================

-- LLM 사용량(월) — provider 별 토큰·호출 누적
create table public.llm_usage (
  provider   text not null,
  period     text not null,            -- 'YYYY-MM' (KST)
  tokens     bigint not null default 0,
  calls      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

-- LLM 설정 — provider on/off + 월 토큰 한도
create table public.llm_settings (
  provider             text primary key,
  enabled              boolean not null default true,
  monthly_token_limit  bigint not null default 1000000
);

insert into public.llm_settings (provider, enabled, monthly_token_limit) values
  ('gemini',     true, 1000000),
  ('groq',       true, 1000000),
  ('cerebras',   true, 1000000),
  ('openrouter', true, 1000000)
on conflict (provider) do nothing;

-- 사용량 원자적 증가 RPC (increment_translation_usage 패턴 동형)
create or replace function public.increment_llm_usage(
  p_provider text,
  p_period   text,
  p_tokens   bigint,
  p_calls    integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.llm_usage (provider, period, tokens, calls, updated_at)
  values (p_provider, p_period, greatest(p_tokens, 0), greatest(p_calls, 0), now())
  on conflict (provider, period) do update
  set tokens     = public.llm_usage.tokens + excluded.tokens,
      calls      = public.llm_usage.calls  + excluded.calls,
      updated_at = now();
$$;

revoke all on function public.increment_llm_usage(text, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.increment_llm_usage(text, text, bigint, integer)
  to service_role;

-- RLS: admin 조회 가능 / 쓰기는 service_role RPC 전용
alter table public.llm_usage    enable row level security;
alter table public.llm_settings enable row level security;

create policy "llm_usage admin"
  on public.llm_usage for select
  using (public.is_admin());

create policy "llm_settings admin"
  on public.llm_settings for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.llm_usage    from anon, authenticated;
grant select, insert, update on table public.llm_usage    to service_role;

revoke all on table public.llm_settings from anon, authenticated;
grant select, insert, update on table public.llm_settings to service_role;
