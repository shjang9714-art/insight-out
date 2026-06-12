-- ============================================================================
-- TTS 월간 사용량 측정 — 예산 폭탄 방지 (Google Cloud TTS 무료 한도 가드)
-- ----------------------------------------------------------------------------
-- 목적: 모닝브리핑 TTS 글자 수를 월(KST)별로 누적 → 호출 전 한도 체크에 사용.
--   무료 한도: WaveNet/Standard 400만 자/월, Neural2 100만 자/월.
--   앱에서 한도보다 보수적인 상한(TTS_MONTHLY_CHAR_CAP, 예: 3,500,000)을 두고,
--   합산이 상한 초과면 합성 호출을 막아 과금을 원천 차단(#50 에서 적용).
-- 패턴: translation_usage 와 동일(번역 사용량 미러). service_role 전용.
-- 실행: 수희 핸드오프 — Supabase SQL Editor 1회. 멱등.
-- ============================================================================

create table if not exists public.tts_usage (
  provider   text not null default 'google',
  period     text not null,                 -- 'YYYY-MM' (KST)
  chars      bigint not null default 0 check (chars >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

alter table public.tts_usage enable row level security;

-- 클라이언트 직접 접근 차단(서버 service_role 만)
revoke all on table public.tts_usage from anon, authenticated;
grant select, insert, update on table public.tts_usage to service_role;

create or replace function public.increment_tts_usage(
  p_provider text,
  p_period   text,
  p_chars    bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tts_usage (provider, period, chars, updated_at)
  values (p_provider, p_period, greatest(p_chars, 0), now())
  on conflict (provider, period) do update
  set chars = public.tts_usage.chars + excluded.chars,
      updated_at = now();
$$;

revoke all on function public.increment_tts_usage(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.increment_tts_usage(text, text, bigint)
  to service_role;

-- 확인용:
-- select * from public.tts_usage order by period desc;
