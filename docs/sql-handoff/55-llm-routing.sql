-- ============================================================
-- 지시서 55 — LLM 모델 카탈로그 + 용도별 라우팅 테이블
-- 수희 실행: Supabase Dashboard → SQL Editor 에서 1회 실행
-- ⚠️ model_id 현행화 메모 (2026-06):
--   - Cerebras 공개 API: gpt-oss-120b, zai-glm-4.7 (llama/qwen은 전용엔드포인트로 이동)
--   - Groq: openai/gpt-oss-120b (llama-4-scout 2026-06-17 폐기 → 교체)
--   - Gemini 2.0 종료(2026-06-01) → gemini-2.5-flash 사용
-- ============================================================

-- 모델 카탈로그: provider별 제공 모델 목록
create table public.llm_models (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  model_id       text not null,                 -- API 모델 식별자
  label          text,
  strengths      text[] not null default '{}',  -- speed · korean · reasoning · volume · fallback
  context_tokens integer,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (provider, model_id)
);

-- 용도별 라우팅: task_type → 우선순위별 provider/model
create table public.llm_task_routing (
  id         uuid primary key default gen_random_uuid(),
  task_type  text not null,        -- 'classify' | 'summarize' | 'report'
  priority   integer not null,     -- 낮을수록 먼저
  provider   text not null,
  model_id   text not null,
  is_active  boolean not null default true,
  unique (task_type, priority)
);

alter table public.llm_models       enable row level security;
alter table public.llm_task_routing enable row level security;

create policy "llm_models admin"
  on public.llm_models for all
  using (public.is_admin()) with check (public.is_admin());

create policy "llm_routing admin"
  on public.llm_task_routing for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on table public.llm_models       from anon, authenticated;
grant select, insert, update, delete on table public.llm_models       to service_role;

revoke all on table public.llm_task_routing from anon, authenticated;
grant select, insert, update, delete on table public.llm_task_routing to service_role;

-- ── 모델 카탈로그 시드 (2026-06 확인 기준) ──────────────────────────────
insert into public.llm_models (provider, model_id, label, strengths, context_tokens) values
  -- Gemini: 2.5 Flash (무료, 2.0은 2026-06-01 종료)
  ('gemini',     'gemini-2.5-flash',
   'Gemini 2.5 Flash',           array['korean','balanced'],          1000000),
  -- Groq: 현행 모델 (llama-4-scout 2026-06-17 폐기)
  ('groq',       'openai/gpt-oss-120b',
   'GPT-OSS 120B (Groq)',         array['speed','reasoning'],          131072),
  -- Cerebras: 공개 API 확인 모델 (2026-06 기준 gpt-oss-120b, zai-glm-4.7)
  ('cerebras',   'gpt-oss-120b',
   'GPT OSS 120B (Cerebras)',     array['speed','volume'],             8192),
  ('cerebras',   'zai-glm-4.7',
   'Z.ai GLM 4.7 (Cerebras)',     array['reasoning'],                  NULL),
  -- OpenRouter: 안정적 무료 모델
  ('openrouter', 'meta-llama/llama-3.3-70b-instruct:free',
   'Llama 3.3 70B (OpenRouter)',  array['fallback'],                   131072)
on conflict (provider, model_id) do nothing;

-- ── 용도별 라우팅 시드 ───────────────────────────────────────────────────
-- classify: 고빈도·속도 우선. Cerebras(초고속) → Groq → Gemini → OpenRouter
-- summarize: 한국어 품질 우선. Gemini → Cerebras fallback
-- report: 추론·장문 우선. Cerebras 고성능 → Gemini
insert into public.llm_task_routing (task_type, priority, provider, model_id) values
  ('classify',  1, 'cerebras',   'gpt-oss-120b'),
  ('classify',  2, 'groq',       'openai/gpt-oss-120b'),
  ('classify',  3, 'gemini',     'gemini-2.5-flash'),
  ('classify',  4, 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free'),
  ('summarize', 1, 'gemini',     'gemini-2.5-flash'),
  ('summarize', 2, 'cerebras',   'gpt-oss-120b'),
  ('report',    1, 'cerebras',   'zai-glm-4.7'),
  ('report',    2, 'gemini',     'gemini-2.5-flash')
on conflict (task_type, priority) do nothing;
