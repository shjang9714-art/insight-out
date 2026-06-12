-- ============================================================================
-- 모닝브리핑 스키마 — briefings 테이블 + 오디오 Storage + RLS + 시드
-- ----------------------------------------------------------------------------
-- 목적: Phase 3-B 모닝브리핑의 단일 데이터 계약.
--   - 수희 트랙(#47·#48): 스크립트 생성 → INSERT/UPDATE (script, source_content_ids, status='draft')
--   - 용주 트랙(#50·#52): script 읽어 TTS(Google Cloud) → 오디오 업로드 → UPDATE (audio_url, voice, duration)
--   - 어드민(#49): draft 미리보기·재생성·승인(status='published')
--   - 플레이어/아카이브(#51·#53): status in ('published','archived') 조회
-- 실행: 수희 핸드오프 — Supabase SQL Editor 1회 실행 + Storage 버킷 'briefings' 생성(아래 4번).
-- 후속: schema.sql 갱신은 구현 지시서에서 함께. 멱등 설계.
-- ============================================================================

-- 1) 상태 enum
do $$ begin
  create type briefing_status as enum ('draft', 'published', 'archived', 'failed');
exception when duplicate_object then null; end $$;

-- 2) 테이블
create table if not exists public.briefings (
  id                     uuid primary key default gen_random_uuid(),
  briefing_date          date not null,                 -- KST 기준 브리핑 날짜 (하루 1건)
  title                  text,                           -- 예: "6월 11일 모닝브리핑"
  script                 text,                           -- LLM 생성 스크립트 (#47 수희)
  source_content_ids     uuid[] not null default '{}',   -- 선정된 기사 id 들 (#47, "관련 기사" 링크용)
  audio_url              text,                           -- 오디오 경로/URL (#50·#52 용주)
  audio_duration_seconds integer,                        -- 재생 길이 (#51 플레이어)
  voice                  text default 'ko-KR-Wavenet-C', -- Google Cloud TTS 한국어 보이스 (WaveNet: 무료 400만자/월·초과 $4·예산 안전)
  status                 briefing_status not null default 'draft',
  generated_at           timestamptz,                    -- 스크립트 생성 시각
  published_at           timestamptz,                    -- 승인/공개 시각
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 하루 1건 보장 + 조회 인덱스
create unique index if not exists briefings_date_key   on public.briefings (briefing_date);
create index        if not exists briefings_status_idx on public.briefings (status, briefing_date desc);

-- updated_at 자동 갱신 (기존 공용 함수 재사용)
drop trigger if exists set_briefings_updated_at on public.briefings;
create trigger set_briefings_updated_at
  before update on public.briefings
  for each row execute function public.set_updated_at();

-- 3) RLS — 인증 사용자는 공개분만 조회, admin 은 전체 관리
alter table public.briefings enable row level security;

drop policy if exists "briefings: 인증 사용자 공개분 조회" on public.briefings;
create policy "briefings: 인증 사용자 공개분 조회"
  on public.briefings for select
  using (auth.role() = 'authenticated' and status in ('published', 'archived'));

drop policy if exists "briefings: admin 관리" on public.briefings;
create policy "briefings: admin 관리"
  on public.briefings for all
  using (public.is_admin()) with check (public.is_admin());

-- 4) Storage 버킷 'briefings' (오디오)
--    ※ 버킷 생성은 Supabase 대시보드 > Storage > New bucket: 이름 "briefings",
--      Public 권장(오디오는 비민감 + <audio> 재생 단순화). Public 으로 만들면 아래 정책 생략 가능.
--    Private 로 둘 경우, 아래 정책 적용(인증 사용자 조회 / admin 쓰기):
-- drop policy if exists "briefings audio: 인증 사용자 조회" on storage.objects;
-- create policy "briefings audio: 인증 사용자 조회"
--   on storage.objects for select
--   using (bucket_id = 'briefings' and auth.role() = 'authenticated');
-- drop policy if exists "briefings audio: admin 쓰기" on storage.objects;
-- create policy "briefings audio: admin 쓰기"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'briefings' and public.is_admin());

-- 5) 시드 1건 (용주 병렬 개발용 — 플레이어/아카이브가 즉시 동작, audio_url 은 #52 에서 채움)
insert into public.briefings (briefing_date, title, script, status, generated_at, published_at)
values (
  current_date,
  '오늘의 모닝브리핑 (샘플)',
  E'안녕하세요. 오늘의 B2B 텔레콤·엔터프라이즈 시장 브리핑입니다.\n\n첫 번째 소식입니다. ... (샘플 스크립트 — 실데이터는 #47 파이프라인이 채웁니다.)\n\n이상으로 오늘의 브리핑을 마칩니다.',
  'published',
  now(),
  now()
)
on conflict (briefing_date) do nothing;

-- 확인용 (실행 후):
-- select briefing_date, status, length(script) as script_len, audio_url from public.briefings order by briefing_date desc;
