-- #47 모닝브리핑 LLM 라우팅 seed (멱등 upsert)
-- 긴 출력(1,200~2,000자 스크립트)에 강한 모델을 우선순위 1로 배치.

INSERT INTO public.llm_task_routing (id, task_type, priority, provider, model_id, is_active)
VALUES
  (gen_random_uuid(), 'briefing', 1, 'gemini', 'gemini-2.5-flash', true),
  (gen_random_uuid(), 'briefing', 2, 'openrouter', 'google/gemini-2.0-flash-exp:free', true)
ON CONFLICT (task_type, priority)
DO UPDATE SET
  provider  = EXCLUDED.provider,
  model_id  = EXCLUDED.model_id,
  is_active = EXCLUDED.is_active;
