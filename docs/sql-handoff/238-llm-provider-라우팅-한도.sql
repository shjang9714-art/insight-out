-- 238 LLM provider 확장 — SambaNova·Mistral 라우팅 편입 + Cerebras 한도 상향
-- 핸드오프: 수희 → Supabase SQL Editor. 그대로 실행(한 번에 OK, 트랜잭션 안전).
-- 전제(코드): 지시서 238이 sambanova/mistral provider를 코드에 추가·배포한 뒤 적용할 것.
--   (provider 코드가 없으면 라우팅에 있어도 PROVIDER_MAP 미스로 skip될 뿐, 오류는 아님)
-- 전제(env): SAMBANOVA_API_KEYS, MISTRAL_API_KEYS 등록 완료(David, Vercel).
-- 근거(2026-07-09 실측, /api/admin/llm):
--   cerebras 사용량 1,003,103 / 월한도 1,000,000 = 100% 소진(자체 캡이 하루치보다 작음).
--   groq 0(키 방금 등록), openrouter 0, gemini 416,997.
--   → 분류 주력 cerebras 조기 소진 + 부하가 gemini(무료 RPM 빡빡)로 몰려 간헐 실패.

begin;

-- ── 1. llm_settings: Cerebras 한도 상향 + 신규 provider 행 ─────────────────
-- Cerebras 무료 실한도는 대략 하루 ~1M 토큰 → 월 캡 1M은 하루치도 안 됨. 30M으로 상향
-- (실제 일일 한도 초과 시 provider가 429 → null 반환 → 다음 라우팅으로 자연 폴백).
insert into public.llm_settings (provider, enabled, monthly_token_limit) values
  ('cerebras',  true, 30000000),
  ('sambanova', true, 10000000),
  ('mistral',   true, 30000000)
on conflict (provider) do update
  set enabled = excluded.enabled,
      monthly_token_limit = excluded.monthly_token_limit;

-- ── 2. llm_models: 신규 provider 모델 카탈로그(어드민 표시용) ──────────────
insert into public.llm_models (provider, model_id, label, is_active)
select v.provider, v.model_id, v.label, v.is_active
from (values
  ('sambanova', 'Meta-Llama-3.3-70B-Instruct', 'Llama 3.3 70B (SambaNova)', true),
  ('mistral',   'mistral-small-latest',        'Mistral Small (Mistral)',   true)
) as v(provider, model_id, label, is_active)
where not exists (
  select 1 from public.llm_models m
  where m.provider = v.provider and m.model_id = v.model_id
);

-- ── 3. llm_task_routing: 전체 재구성(현행 실값 + sambanova/mistral 편입) ────
-- 목표: 분류는 빠른 무료(cerebras→sambanova→groq)를 앞세워 gemini 부하 완화,
--       요약/리포트/브리핑/인사이트에도 무료 대안을 폴백으로 추가.
delete from public.llm_task_routing;

insert into public.llm_task_routing (task_type, priority, provider, model_id, is_active) values
  -- 분류(고빈도·속도 우선): cerebras → sambanova → groq → gemini → openrouter → mistral
  ('classify', 1, 'cerebras',   'gpt-oss-120b',                          true),
  ('classify', 2, 'sambanova',  'Meta-Llama-3.3-70B-Instruct',           true),
  ('classify', 3, 'groq',       'openai/gpt-oss-120b',                   true),
  ('classify', 4, 'gemini',     'gemini-2.5-flash',                      true),
  ('classify', 5, 'openrouter', 'meta-llama/llama-3.3-70b-instruct:free',true),
  ('classify', 6, 'mistral',    'mistral-small-latest',                  true),

  -- 요약: gemini → sambanova → cerebras → mistral
  ('summarize', 1, 'gemini',    'gemini-2.5-flash',                      true),
  ('summarize', 2, 'sambanova', 'Meta-Llama-3.3-70B-Instruct',           true),
  ('summarize', 3, 'cerebras',  'gpt-oss-120b',                          true),
  ('summarize', 4, 'mistral',   'mistral-small-latest',                  true),

  -- 리포트(품질): cerebras(GLM) → gemini → mistral
  ('report', 1, 'cerebras',     'zai-glm-4.7',                           true),
  ('report', 2, 'gemini',       'gemini-2.5-flash',                      true),
  ('report', 3, 'mistral',      'mistral-small-latest',                  true),

  -- 브리핑: gemini → openrouter → sambanova
  ('briefing', 1, 'gemini',     'gemini-2.5-flash',                      true),
  ('briefing', 2, 'openrouter', 'google/gemini-2.0-flash-exp:free',      true),
  ('briefing', 3, 'sambanova',  'Meta-Llama-3.3-70B-Instruct',           true),

  -- 핵심 인사이트: gemini → openrouter → sambanova
  ('key_insight', 1, 'gemini',     'gemini-2.5-flash',                   true),
  ('key_insight', 2, 'openrouter', 'google/gemini-2.0-flash-exp:free',   true),
  ('key_insight', 3, 'sambanova',  'Meta-Llama-3.3-70B-Instruct',        true);

commit;

-- 검증(적용 후):
-- select task_type, priority, provider, model_id, is_active
--   from public.llm_task_routing order by task_type, priority;
-- select provider, enabled, monthly_token_limit from public.llm_settings order by provider;
-- 어드민 /admin/llm 에서 sambanova/mistral 카드 노출 + cerebras 한도 30M 확인.
--
-- 롤백 필요 시: 라우팅은 전체 재구성이므로 이전 값 복원하려면 아래 원본(2026-07-09) 참고—
--   classify: 1 cerebras/gpt-oss-120b, 2 groq/openai·gpt-oss-120b, 3 gemini/2.5-flash, 4 openrouter/llama-3.3-70b:free
--   summarize: 1 gemini/2.5-flash, 2 cerebras/gpt-oss-120b
--   report: 1 cerebras/zai-glm-4.7, 2 gemini/2.5-flash
--   briefing: 1 gemini/2.5-flash, 2 openrouter/gemini-2.0-flash-exp:free
--   key_insight: 1 gemini/2.5-flash, 2 openrouter/gemini-2.0-flash-exp:free
--   settings: cerebras 한도 1000000
