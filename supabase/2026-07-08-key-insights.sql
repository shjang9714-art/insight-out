-- ============================================================
-- "주목하세요, 핵심 Insight" 주간 파이프라인 — key_insights 테이블
-- 지시서: docs/sonnet-지시서/(2026-07-08 핵심Insight 지시서) §1
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 의존: public.issues, public.set_updated_at(), public.is_admin()
-- ============================================================

-- ── 1) 테이블 ─────────────────────────────────────────────────
create table if not exists public.key_insights (
  id            uuid primary key default gen_random_uuid(),
  week_of       date not null,                 -- 배치 주차 시작일(목)
  status        text not null default 'draft', -- draft | needs_review | published | rejected
  display_order integer,                        -- 배치 내 중요도순
  is_featured   boolean not null default false, -- 홈 3건 노출 대상
  category      text,                           -- 뉴스/유튜브/리서치/웹인사이트 등 (가이드 §1의 7개 카테고리)
  headline      text not null,
  summary_ko    text not null,                  -- 핵심요약 2문장
  implication   text,                           -- LGU+ 관점 시사점 1~2문장
  source_name   text,                           -- 매체명
  published_at  date,                           -- 원문 발행일
  source_url    text,                           -- 대표 원문 링크
  is_new        boolean not null default false, -- NEW 배지(신선도 충족)
  needs_verify  boolean not null default false, -- 링크 검증 필요 표기
  issue_id      uuid references public.issues(id) on delete set null,
  related_past  jsonb,        -- [{content_id,title,url,source,published_at,reason}] 과거 관련 기사 1~2건
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_key_insights_week      on public.key_insights(week_of);
create index if not exists idx_key_insights_status    on public.key_insights(status);
create index if not exists idx_key_insights_featured  on public.key_insights(is_featured) where is_featured;

create trigger set_key_insights_updated_at
  before update on public.key_insights
  for each row execute function public.set_updated_at();

-- ── 2) RLS (AGENTS.md 규칙 7 — 신규 테이블 필수) ─────────────
alter table public.key_insights enable row level security;

create policy "key_insights: 인증 사용자 published 조회"
  on public.key_insights for select
  using (auth.role() = 'authenticated' and status = 'published');

create policy "key_insights: admin 전체 조회"
  on public.key_insights for select
  using (public.is_admin());

create policy "key_insights: admin 관리"
  on public.key_insights for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3) GRANT (★ 2026-05-30 이후 Data API 기본 비노출 — 필수) ──
grant select on public.key_insights to anon, authenticated;
grant insert, update on public.key_insights to authenticated;

-- ── 4) LLM 태스크 라우팅 시드 — key_insight (모닝브리핑 briefing과 동일 모델) ──
insert into public.llm_task_routing (id, task_type, priority, provider, model_id, is_active)
values
  (gen_random_uuid(), 'key_insight', 1, 'gemini', 'gemini-2.5-flash', true),
  (gen_random_uuid(), 'key_insight', 2, 'openrouter', 'google/gemini-2.0-flash-exp:free', true)
on conflict (task_type, priority)
do update set
  provider  = excluded.provider,
  model_id  = excluded.model_id,
  is_active = excluded.is_active;

-- ── 5) 확인 쿼리 ──────────────────────────────────────────────
select count(*) as total,
       count(*) filter (where status = 'published') as published,
       count(*) filter (where is_featured) as featured
from public.key_insights;

select task_type, priority, provider, model_id, is_active
from public.llm_task_routing
where task_type = 'key_insight'
order by priority;
