-- 284 경쟁사 주간 리포트 발행 스케줄 설정 — 싱글턴 설정 테이블
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에). 멱등.
-- 전제: 261(competitor_weekly_reports) 적용됨. 공용 트리거 함수 set_updated_at 존재(221 등에서 사용).
-- 적용 후 점등: 어드민 "경쟁사 주간 리포트 > 발행 스케줄" 설정(요일·시각·자동발행·on/off).
--
-- 배경: Vercel 크론 스케줄은 vercel.json 에 배포시점으로 고정돼 런타임에 바꿀 수 없다.
--   → 크론을 매시간(0 * * * *) 돌리고, 라우트가 이 설정을 읽어
--     "지금이 설정된 요일·시각(KST)인가"를 판정해 아니면 즉시 스킵하는 방식으로 구현한다.
--   → 값은 관리자가 생각하는 그대로 KST 기준으로 저장한다(라우트가 Asia/Seoul 로 환산 비교).
-- 참고: 기존 크론 "0 21 * * 0"(UTC 일요일 21시)은 실제로는 월요일 06시 KST 에 돌던 것.

begin;

create table if not exists public.competitor_weekly_settings (
  id            boolean primary key default true check (id),   -- 단일행 강제(crawl_settings 패턴)
  enabled       boolean  not null default true,                -- 자동 생성 on/off
  generate_dow  smallint not null default 1                    -- 생성 요일(KST) 0=일 … 6=토
                 check (generate_dow between 0 and 6),
  generate_hour smallint not null default 6                    -- 생성 시각(KST) 0~23
                 check (generate_hour between 0 and 23),
  auto_publish  boolean  not null default false,               -- true=생성 즉시 published, false=draft로 두고 어드민이 발행
  updated_at    timestamptz not null default now()
);

-- 기본 1행 시드(기존 동작과 동일: 월요일 06시 KST = 구 "0 21 * * 0" UTC, 초안으로 생성)
insert into public.competitor_weekly_settings (id) values (true) on conflict (id) do nothing;

-- updated_at 자동 갱신(공용 트리거 함수 재사용)
drop trigger if exists trg_competitor_weekly_settings_updated_at on public.competitor_weekly_settings;
create trigger trg_competitor_weekly_settings_updated_at
  before update on public.competitor_weekly_settings
  for each row execute function public.set_updated_at();

-- 어드민(서버 service_role)만 읽고 쓴다 → RLS 켜고 정책은 두지 않음(service_role 은 RLS 우회).
alter table public.competitor_weekly_settings enable row level security;

commit;

-- ── 확인용(선택) ─────────────────────────────────────────────────────────────
--   select * from public.competitor_weekly_settings;
--   -- enabled=t, generate_dow=1(월), generate_hour=6, auto_publish=f 가 기본
