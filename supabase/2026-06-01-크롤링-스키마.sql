-- ============================================================
-- 크롤링 스키마 추가 — 2026-06-01
-- #4 크롤러가 적재 대상으로 삼는 테이블/컬럼 보강.
-- 실행: 수희 (Supabase SQL Editor) — Phase 1-B 적용 이후
-- 멱등(idempotent): 가드 처리되어 여러 번 실행해도 안전.
-- 포함:
--   1) crawl_logs 테이블 + crawl_status enum + RLS (#3 §6, 어드민 #23)
--   2) contents.status (pending/published/rejected) — is_published 대체 (BL-4)
--   3) contents.cluster_id 자기참조 — 유사중복 "관련 기사 N건" 그룹 (BL-3)
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 크롤링 로그
-- ------------------------------------------------------------

do $$ begin
  create type crawl_status as enum ('success', 'partial', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.crawl_logs (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid references public.sources (id) on delete set null,
  status          crawl_status not null,
  fetched_count   integer not null default 0,   -- 가져온 raw 건수
  inserted_count  integer not null default 0,   -- 신규 적재
  duplicate_count integer not null default 0,   -- 중복 스킵
  held_count      integer not null default 0,   -- 보류(pending) 적재
  error_message   text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists crawl_logs_source_idx
  on public.crawl_logs (source_id, created_at desc);

alter table public.crawl_logs enable row level security;

-- 크롤러는 service_role 로 RLS 우회 적재. 조회는 admin 만.
drop policy if exists "crawl_logs: admin 조회" on public.crawl_logs;
create policy "crawl_logs: admin 조회"
  on public.crawl_logs for select using (public.is_admin());

-- ------------------------------------------------------------
-- 2) contents.status — 품질 보류/승인 상태 (BL-4)
--    현 is_published(boolean) → pending/published/rejected(enum) 대체
-- ------------------------------------------------------------

do $$ begin
  create type content_status as enum ('pending', 'published', 'rejected');
exception
  when duplicate_object then null;
end $$;

alter table public.contents
  add column if not exists status content_status not null default 'published';

-- 기존 is_published 값이 남아 있으면 status 로 이관 후 컬럼 제거
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contents'
      and column_name = 'is_published'
  ) then
    update public.contents
      set status = case when is_published then 'published'::content_status
                        else 'rejected'::content_status end;

    -- is_published 를 참조하던 조회 정책을 status 기반으로 교체
    drop policy if exists "contents: 인증 사용자 조회" on public.contents;
    create policy "contents: 인증 사용자 조회"
      on public.contents for select
      using (auth.role() = 'authenticated' and status = 'published');

    alter table public.contents drop column is_published;
  end if;
end $$;

create index if not exists contents_status_idx
  on public.contents (status);

-- ------------------------------------------------------------
-- 3) contents.cluster_id — 유사중복 대표/그룹 (BL-3, PRD 4.4)
--    "관련 기사 N건": 같은 사건 보도를 한 그룹으로 묶고 대표 1건 노출.
--    null = 단독 기사. 값 = 그룹 대표 content.id (자기참조).
-- ------------------------------------------------------------

alter table public.contents
  add column if not exists cluster_id uuid references public.contents (id) on delete set null;

create index if not exists contents_cluster_idx
  on public.contents (cluster_id) where cluster_id is not null;

commit;
