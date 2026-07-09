-- 251 브리핑·핵심인사이트 라우팅 안정화 — 무료 openrouter 강등
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 진단(2026-07-09): 7/8·7/9 모닝브리핑 status='failed', error_reason="openrouter: 응답 없음".
--   원인: briefing 체인이 gemini(1)→openrouter(2)뿐이라 둘 다 실패한 날(gemini 429/쿼터 + openrouter
--   무료모델 무응답) 폴백 소진 → 실패. 238에서 sambanova를 3순위로 추가했으나, 여전히 불안정한
--   openrouter(무료 exp 모델)가 2순위라 매번 그걸 먼저 시도.
-- 처방: 안정적 provider(sambanova·cerebras)를 openrouter보다 앞에 두어 브리핑·핵심인사이트 견고화.
--   openrouter(무료)는 최후 폴백으로.

begin;

-- ── briefing 재구성: gemini → sambanova → cerebras → openrouter ────────────────
delete from public.llm_task_routing where task_type = 'briefing';
insert into public.llm_task_routing (task_type, priority, provider, model_id, is_active) values
  ('briefing', 1, 'gemini',     'gemini-2.5-flash',                      true),
  ('briefing', 2, 'sambanova',  'Meta-Llama-3.3-70B-Instruct',           true),
  ('briefing', 3, 'cerebras',   'gpt-oss-120b',                          true),
  ('briefing', 4, 'openrouter', 'google/gemini-2.0-flash-exp:free',      true);

-- ── key_insight 동일 패턴 재구성 (openrouter 강등) ────────────────────────────
delete from public.llm_task_routing where task_type = 'key_insight';
insert into public.llm_task_routing (task_type, priority, provider, model_id, is_active) values
  ('key_insight', 1, 'gemini',     'gemini-2.5-flash',                   true),
  ('key_insight', 2, 'sambanova',  'Meta-Llama-3.3-70B-Instruct',        true),
  ('key_insight', 3, 'cerebras',   'gpt-oss-120b',                       true),
  ('key_insight', 4, 'openrouter', 'google/gemini-2.0-flash-exp:free',   true);

commit;

-- 검증:
-- select task_type, priority, provider, model_id from public.llm_task_routing
--   where task_type in ('briefing','key_insight') order by task_type, priority;
--
-- 적용 후: 실패한 브리핑(7/8·7/9)을 어드민 /admin/briefings 에서 재생성하면
--   gemini 실패 시 sambanova/cerebras 로 넘어가 성공할 가능성 큼.
