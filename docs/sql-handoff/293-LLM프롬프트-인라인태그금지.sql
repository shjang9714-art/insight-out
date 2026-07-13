-- 293 LLM 프롬프트 정정 — 서술문에 <quote> 태그·[content_id] 넣지 말 것 (전역)
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN. 멱등.
-- 전제: 253(llm_prompts + company_insight 시드) · 274(strategy_report 시드) 적용됨.
--
-- 배경:
--   화면에 이런 게 그대로 노출되고 있다:
--     <quote>'금의환향' 주목</quote> [9f6b8f67-f77a-...]
--
--   LLM 생성기 3개가 전부 citations:[{content_id, quote}] 를 JSON 필드로 요구하는데,
--   LLM이 그걸 **서술문 안에도** <quote> 태그와 [uuid] 로 박아 넣는다.
--
--   경쟁사 주간(261)은 "각 서술 끝에 근거 [content_id]" 라고 **명시적으로 시켰고**,
--   283 SQL 로 그 지시를 제거했다.
--   그런데 company_insight(253)·strategy_report(274)는 **시키지도 않았는데** LLM이 넣는다.
--   → 그래서 "넣지 말라"고 **명시적으로 금지**해야 한다. (렌더 단 스트립은 코드에서 별도 처리)
--
-- ⚠️ 프롬프트 수정만으로는 완전히 못 막는다(LLM이 지시를 어길 수 있다).
--    293 지시서의 렌더 단 스트립이 최종 방어선이다. 이 SQL 은 "다음 생성분 오염 방지"용.

begin;

-- ── 1. company_insight (253 시드) — 서술 필드에 태그·id 금지 명시 ────────────
update public.llm_prompts
   set prompt_text = replace(
         prompt_text,
         $old$- citations: 각 핵심 주장마다 입력 기사의 15단어 이내 인용 + content_id. 3건 이상 권장.$old$,
         $new$- citations: 각 핵심 주장마다 입력 기사의 15단어 이내 인용 + content_id. 3건 이상 권장.
**중요**: card_headline·headline·implication 등 서술 필드에는 <quote> 같은 태그나 대괄호 id([...])를 절대 넣지 말 것. 근거는 citations 배열로만 제공한다. 서술문은 순수한 한국어 문장이어야 한다.$new$
       )
 where key = 'company_insight'
   and prompt_text not like '%서술 필드에는 <quote> 같은 태그나%';   -- 멱등 가드

-- ── 2. strategy_report (274 시드) — 본문 HTML 에 태그·id 금지 명시 ───────────
-- 전략보고서는 body_html 을 생성한다. sanitize-html 이 <quote> 태그는 제거하지만
-- [uuid] 는 평문이라 그대로 통과한다.
update public.llm_prompts
   set prompt_text = prompt_text || $add$

**중요**: 본문 HTML 에 <quote> 같은 임의 태그나 대괄호 id([...])를 넣지 말 것. 근거는 문장으로 서술하고, 출처 링크는 시스템이 별도로 붙인다.$add$
 where key = 'strategy_report'
   and prompt_text not like '%임의 태그나 대괄호 id%';               -- 멱등 가드

commit;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
-- 두 프롬프트에 금지 문구가 들어갔는지(각각 1이어야):
--   select key,
--          (prompt_text like '%서술 필드에는 <quote> 같은 태그나%')::int as company_ok,
--          (prompt_text like '%임의 태그나 대괄호 id%')::int          as strategy_ok
--     from public.llm_prompts
--    where key in ('company_insight', 'strategy_report');
--
-- 참고: competitor_weekly_area 는 283 SQL 에서 이미 처리됨.
--   select (prompt_text like '%각 서술 끝에 근거 [content_id]%')::int as still_bad
--     from public.llm_prompts where key = 'competitor_weekly_area';   -- 0 이어야 정상


-- ═══════════════════════════════════════════════════════════════════════════
-- [추가 확인 — 305 조회 계측] 아래 select 를 함께 돌리고 결과를 David 에게 알려주세요.
--   305 배포 후, 콘텐츠 상세를 한 번이라도 연 다음에 실행해야 의미가 있습니다.
-- ═══════════════════════════════════════════════════════════════════════════
select
  count(*)                                  as 조회기록_건수,   -- 0 이면 RLS 가 막고 있다는 뜻
  count(*) filter (where dwell_seconds > 0) as 체류시간_기록됨, -- 0 이면 PATCH 가 안 오는 것
  max(viewed_at)                            as 최근_기록
from public.content_views;

-- content_views 의 RLS 정책 (insert 가 허용돼 있는지):
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'content_views';
