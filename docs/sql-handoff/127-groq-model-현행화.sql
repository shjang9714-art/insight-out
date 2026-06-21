-- 127: Groq 폐기모델(llama-4-scout-17b-16e-instruct → 2026-06-17 폐기) → 현행 openai/gpt-oss-120b. 멱등.
-- 수희 실행: Supabase Dashboard → SQL Editor

-- 라우팅 실효값 교체
update public.llm_task_routing
set model_id = 'openai/gpt-oss-120b'
where provider = 'groq'
  and model_id = 'llama-4-scout-17b-16e-instruct';

-- 카탈로그: 폐기모델 비활성 + 현행모델 보장
update public.llm_models set is_active = false
where provider = 'groq' and model_id = 'llama-4-scout-17b-16e-instruct';

insert into public.llm_models (provider, model_id, label, strengths, context_tokens)
values ('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B (Groq)', array['speed', 'reasoning'], 131072)
on conflict (provider, model_id) do update set is_active = true;

-- 확인
select task_type, priority, provider, model_id, is_active
from public.llm_task_routing where task_type = 'classify' order by priority;
