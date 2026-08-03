-- 482-B llm_task_routing 모델 오류 기록 컬럼
-- 적용: David 직접 (Supabase SQL Editor). 전체 붙여넣고 RUN. 멱등.
--
-- 배경:
--   라우팅 행의 model_id 가 provider 에서 사라져도(404) 시스템이 조용히 실패한다.
--   실제로 두 번 발생했다 — 'google/gemini-2.0-flash-exp:free' → 'meta-llama/llama-3.3-70b-instruct:free'
--   → 후자도 2026-07-30 유료 전환으로 404. 그동안 감지 장치가 없었다.
--   이 컬럼으로 마지막 영구 실패를 행에 기록하고, 어드민 표시 + 운영이슈 탐지에 쓴다.

begin;

alter table public.llm_task_routing
  add column if not exists last_error    text,
  add column if not exists last_error_at timestamptz;

comment on column public.llm_task_routing.last_error is
  '마지막 영구 실패 사유(404/400 모델 사용 불가 등). 성공 시 null 로 초기화된다.';
comment on column public.llm_task_routing.last_error_at is
  '마지막 영구 실패 시각. 성공 시 null 로 초기화된다.';

commit;

-- ────────────────────────────────────────────────────────────────────────────
-- 죽은 openrouter 무료 슬러그를 쓰는 행 찾기 (검색 외 task 도 함께 점검)
--   select task_type, priority, provider, model_id, is_active
--     from public.llm_task_routing
--    where provider = 'openrouter' and model_id like '%:free'
--    order by task_type, priority;
--
-- 2026-07-30 확인된 유효 무료 모델 예시(변동 가능 — 적용 전 openrouter.ai 재확인):
--   openrouter/free                      (무료 모델 자동 라우터, 200K)
--   google/gemma-4-31b-it:free           (262K)
--   openai/gpt-oss-20b:free              (131K)
--   nvidia/nemotron-3-super-120b-a12b:free (262K)
--
-- 교체 예:
--   update public.llm_task_routing
--      set model_id = 'openrouter/free', last_error = null, last_error_at = null
--    where provider = 'openrouter' and model_id = 'meta-llama/llama-3.3-70b-instruct:free';
--
-- ⚠️ llm_models 카탈로그에도 새 모델이 is_active=true 로 있어야 어드민에서 선택 가능하다:
--   insert into public.llm_models (provider, model_id, label, is_active)
--   select 'openrouter', 'openrouter/free', '무료 자동 라우터 (OpenRouter)', true
--   where not exists (
--     select 1 from public.llm_models where provider='openrouter' and model_id='openrouter/free'
--   );
-- ────────────────────────────────────────────────────────────────────────────
