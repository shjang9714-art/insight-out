-- ─────────────────────────────────────────────────────────────────────────────
-- SQL 핸드오프 (수희) — 429 운영 이슈(ops_issues) 테이블
-- 작성: 플래너(Opus) · 2026-07-24 · Phase 2 운영 인텔리전스
-- 선행: 이 테이블이 있어야 429(Sonnet 탐지기)가 upsert 가능. 없으면 429 런타임 실패.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 목적: 반복 에러를 fingerprint 로 하나의 운영 이슈로 묶어 지속 관리
--       (100회 발생해도 1개 이슈). 일일 운영 브리핑 ①섹션·향후 운영센터가 읽음.
-- 쓰기: 탐지기가 service_role(admin client)로 upsert → RLS 우회.
-- 읽기/관리: 관리자만(RLS).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ops_issues (
  id                  uuid primary key default gen_random_uuid(),
  fingerprint         text not null unique,                 -- 예: 'crawl:fail:source_123' / 'cron:fail:cron:briefing' / 'usage:limit:gemini'
  category            text not null,                         -- crawl | cron | usage | enrichment
  severity            text not null default 'warning',       -- critical | warning | notice
  status              text not null default 'open',          -- open | acknowledged | in_progress | resolved | ignored
  title               text not null,                         -- 사람이 읽는 문제명
  suspected_cause     text,                                  -- 원인 추정
  recommended_action  text,                                  -- 권장 조치
  impact              text,                                  -- 영향 범위(요약)
  occurrence_count    integer not null default 1,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  assignee            uuid references public.users(id),
  resolution_note     text,
  related_url         text,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists ops_issues_status_severity_idx on public.ops_issues (status, severity);
create index if not exists ops_issues_last_seen_idx on public.ops_issues (last_seen_at desc);

alter table public.ops_issues enable row level security;

-- 관리자 조회·갱신(상태 변경·담당자·해결메모). 쓰기(생성/집계)는 service_role 로 우회.
drop policy if exists "ops_issues: admin 조회" on public.ops_issues;
create policy "ops_issues: admin 조회" on public.ops_issues
  for select to authenticated using (public.is_admin());

drop policy if exists "ops_issues: admin 갱신" on public.ops_issues;
create policy "ops_issues: admin 갱신" on public.ops_issues
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 검증
-- \d public.ops_issues
-- select policyname, cmd from pg_policies where tablename='ops_issues';
