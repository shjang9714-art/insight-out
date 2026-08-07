-- 493-B: 운영 설정 테이블 (G-11)
-- 적용: David 직접 (Supabase SQL Editor). 전체 붙여넣고 RUN. 멱등.
--
-- 배경:
--   운영 브리프 수신자·TTS/번역 월간 한도·브리핑 파라미터가 env 에 고정돼 있어
--   한도 상향이나 수신자 추가가 재배포 이벤트가 된다.
--   detect-issues.ts 가 이 한도로 80/95% 경보를 내므로 운영 중 조정이 필요하다.
--
-- 설계:
--   범용 key-value 가 아니라 컬럼형 단일 행. 값마다 타입·검증이 다르고,
--   KV 를 만들면 기존 도메인별 설정 테이블 5개에 이어 여섯 번째 패턴이 된다.
--   ⚠️ 비밀키(CRON_SECRET·API 키)는 이 테이블에 넣지 않는다. env 유지.

begin;

create table if not exists public.ops_settings (
  id                        boolean primary key default true,
  brief_recipients          text[]  not null default '{}',
  tts_monthly_char_cap      bigint,
  translation_monthly_char_cap bigint,
  briefing_top_n            integer,
  briefing_min_articles     integer,
  briefing_window_hours     integer,
  briefing_host_name        text,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.users(id) on delete set null,
  constraint ops_settings_singleton check (id),
  constraint ops_settings_caps_positive check (
    (tts_monthly_char_cap is null or tts_monthly_char_cap > 0) and
    (translation_monthly_char_cap is null or translation_monthly_char_cap > 0)
  ),
  constraint ops_settings_briefing_range check (
    (briefing_top_n is null or briefing_top_n between 1 and 50) and
    (briefing_min_articles is null or briefing_min_articles between 1 and 100) and
    (briefing_window_hours is null or briefing_window_hours between 1 and 168)
  )
);

comment on table public.ops_settings is
  '493: 운영 설정 단일 행. NULL 인 값은 코드가 기존 env 로 폴백한다. 비밀키 저장 금지.';
comment on column public.ops_settings.id is
  'singleton 강제용. 항상 true 한 행만 존재한다.';

insert into public.ops_settings (id) values (true) on conflict (id) do nothing;

alter table public.ops_settings enable row level security;

-- 조회는 관리자만. 쓰기 정책은 두지 않는다 → service_role 로만 기록된다.
drop policy if exists "ops_settings: admin 조회" on public.ops_settings;
create policy "ops_settings: admin 조회" on public.ops_settings
  for select using (public.is_admin());

commit;

-- 확인
-- select * from public.ops_settings;
--   → 한 행, 값은 전부 NULL/빈배열 (코드가 env 로 폴백)
