-- key_insight 태스크 openrouter 폴백 모델 교체
-- 배경: 2026-07-08 seed 의 'google/gemini-2.0-flash-exp:free' 가 OpenRouter 에서
-- 제거됨(실측: HTTP 404 "No endpoints found for google/gemini-2.0-flash-exp:free").
-- briefing 등 다른 태스크의 openrouter 폴백 모델도 같은 값이라면 동일 증상일 수 있음(미확인).
-- 'meta-llama/llama-3.3-70b-instruct:free' 는 openai-compat 프로바이더 기본 모델과 동일 —
-- 실측 응답 확인(429 rate-limit 은 발생하나 404 아님 = 모델 자체는 유효).
-- 실행: 수희 (Supabase 대시보드 → SQL Editor). 로컬 테스트 중 service role 로 이미 1회 반영함.

update public.llm_task_routing
set model_id = 'meta-llama/llama-3.3-70b-instruct:free'
where task_type = 'key_insight' and provider = 'openrouter';

select task_type, priority, provider, model_id, is_active
from public.llm_task_routing
where task_type = 'key_insight'
order by priority;
