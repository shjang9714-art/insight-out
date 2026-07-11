-- 283 경쟁사 주간 리포트 프롬프트 정정 — 서술문에 [content_id] 넣으라는 지시 제거
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN. 멱등(이미 고쳐졌으면 no-op).
-- 전제: 253(llm_prompts) + 261(competitor_weekly_area 프롬프트 시드) 적용됨.
--
-- 배경:
--   261 SQL이 llm_prompts 에 시드한 competitor_weekly_area 프롬프트에
--     "- moves: … 종합 서술(각 서술 끝에 근거 [content_id])."
--   라는 지시가 들어 있어, LLM이 서술문 안에 원본 UUID를 박아 넣는다.
--   → 리포트 본문에 [0122e121-0bbe-4758-a642-79aaa65fba8d] 같은 UUID가 그대로 노출됨.
--   출처는 이미 citations 배열(인용문 + content_id)로 따로 받아 화면에 링크 칩으로 표시하므로
--   인라인 UUID는 순수 노이즈다.
--
--   코드(src/lib/competitor-weekly/generate.ts)의 폴백 상수는 283에서 고쳤지만,
--   loadPrompt() 가 **llm_prompts DB 값을 우선**하므로 DB를 안 고치면 신규 리포트에도
--   계속 UUID가 박힌다(화면은 283의 stripInlineCitations 로 가려지지만 DB에는 오염된 채 저장).
--   → 이 SQL로 근본을 정정한다.

begin;

update public.llm_prompts
   set prompt_text = replace(
         prompt_text,
         $old$- moves: 이번 주 이 영역의 핵심 경쟁 움직임 2~4개를 종합 서술(각 서술 끝에 근거 [content_id]). 경쟁사별 사실을 연결해 "무슨 일이 벌어지고 있는지".$old$,
         $new$- moves: 이번 주 이 영역의 핵심 경쟁 움직임 2~4개를 종합 서술. 경쟁사별 사실을 연결해 "무슨 일이 벌어지고 있는지". 서술문에 대괄호로 근거 id를 넣지 말 것 — 근거는 citations 배열로만 제공한다.$new$
       )
 where key = 'competitor_weekly_area'
   and prompt_text like '%각 서술 끝에 근거 [content_id]%';   -- 멱등 가드

commit;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
-- 0건이어야 정상(지시가 남아있으면 1):
--   select count(*) from public.llm_prompts
--    where key = 'competitor_weekly_area'
--      and prompt_text like '%각 서술 끝에 근거 [content_id]%';
--
-- 정정된 moves 줄 확인:
--   select substring(prompt_text from '- moves:[^\n]*')
--     from public.llm_prompts where key = 'competitor_weekly_area';
--
-- 참고: 이 SQL은 앞으로 생성될 리포트에만 영향을 준다.
--   이미 생성된 리포트의 sections jsonb 에 박힌 UUID 는 그대로 남지만,
--   화면에서는 283의 stripInlineCitations() 가 제거하므로 노출되지 않는다.
