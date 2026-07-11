-- ============================================================
-- 핵심 Insight 일일 종합 인사이트 — daily_insights 테이블
-- 지시서: docs/sonnet-지시서/지시서_20260711_핵심Insight-일일종합인사이트-재설계.md
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 의존: public.set_updated_at(), public.is_admin()
-- 참고: key_insights(주간, week_of)와 병행 — 기존 테이블/파이프라인은 건드리지 않음
-- ============================================================

-- ── 1) 테이블 ─────────────────────────────────────────────────
create table if not exists public.daily_insights (
  id               uuid primary key default gen_random_uuid(),
  day_of           date not null,                     -- KST 발행 기준일
  status           text not null default 'published',  -- published | rejected (자동게시, 사전검수 없음)
  needs_review     boolean not null default true,      -- 사후 검토 알림용(검토 완료 시 false)
  display_order    integer not null default 0,         -- 그날 인사이트 정렬(중요도)
  category         text,                                -- 가이드 §1 7개 중 대표 1개

  headline         text not null,        -- 인사이트 한 줄(짧은 버전) = 홈/상세 공용 제목
  summary_ko       text not null,        -- 상세 페이지 1줄 요약(홈 카드 부제)

  market_trend     text,                 -- 시장·산업 동향(근거 없으면 null)
  competitor_trend text,                 -- 경쟁사 동향(근거 없으면 null)
  implication      text,                 -- 자사(LGU+) 관점 시사점(근거 없으면 null)

  source_articles  jsonb,                -- [{content_id,title,url,source,published_at}] 근거 기사(유사중복 제거됨)
  related_past     jsonb,                -- [{content_id,title,url,source,published_at,reason}] 과거 기사(≤6개월, 유사중복 제거됨)

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_daily_insights_day    on public.daily_insights(day_of);
create index if not exists idx_daily_insights_status  on public.daily_insights(status);
create index if not exists idx_daily_insights_review  on public.daily_insights(needs_review) where needs_review;
create index if not exists daily_insights_day_status_idx
  on public.daily_insights (day_of desc, status, display_order asc);

create trigger set_daily_insights_updated_at
  before update on public.daily_insights
  for each row execute function public.set_updated_at();

-- ── 2) RLS (AGENTS.md 규칙 7 — 신규 테이블 필수) ─────────────
alter table public.daily_insights enable row level security;

create policy "daily_insights: 인증 사용자 published 조회"
  on public.daily_insights for select
  using (auth.role() = 'authenticated' and status = 'published');

create policy "daily_insights: admin 전체 조회"
  on public.daily_insights for select
  using (public.is_admin());

create policy "daily_insights: admin 관리"
  on public.daily_insights for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3) GRANT (★ 2026-05-30 이후 Data API 기본 비노출 — 필수) ──
grant select on public.daily_insights to anon, authenticated;
grant insert, update on public.daily_insights to authenticated;

-- ── 4) LLM 태스크 라우팅 시드 — daily_insight (key_insight 와 동일 모델) ──
insert into public.llm_task_routing (id, task_type, priority, provider, model_id, is_active)
values
  (gen_random_uuid(), 'daily_insight', 1, 'gemini', 'gemini-2.5-flash', true),
  (gen_random_uuid(), 'daily_insight', 2, 'openrouter', 'google/gemini-2.0-flash-exp:free', true)
on conflict (task_type, priority)
do update set
  provider  = excluded.provider,
  model_id  = excluded.model_id,
  is_active = excluded.is_active;

-- ── 5) 확인 쿼리 ──────────────────────────────────────────────
select count(*) as total,
       count(*) filter (where status = 'published') as published,
       count(*) filter (where needs_review) as needs_review
from public.daily_insights;

select task_type, priority, provider, model_id, is_active
from public.llm_task_routing
where task_type = 'daily_insight'
order by priority;
