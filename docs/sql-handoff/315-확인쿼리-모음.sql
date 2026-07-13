-- 315 확인 쿼리 모음 (2026-07-12) — 읽기 전용. 데이터를 바꾸지 않습니다.
-- 핸드오프: 수희 → Supabase SQL Editor.
--   ⚠️ **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN 하세요.
--      (과거에 에디터에 남아 있던 다른 쿼리가 섞여 사고가 난 적이 있습니다)
--
--   ⭐ **결과 5개를 David 에게 그대로 전달해 주세요.** 이 숫자로 다음 작업을 정합니다.
--
-- 전제: 186 · 293 · 309 · 312 SQL 적용 완료.
-- 참고: 293 은 이미 적용됐습니다. 이전에 난 에러(column "created_at" does not exist)는
--       확인용 select 의 컬럼명 오타였고(viewed_at 이 맞음), 프롬프트 UPDATE 는 commit 되었습니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- ① 293 — LLM 프롬프트 정정이 실제로 들어갔는가
--    기대: company_ok = 1, strategy_ok = 1
-- ═══════════════════════════════════════════════════════════════════════════
select key,
       (prompt_text like '%서술 필드에는 <quote> 같은 태그나%')::int as company_ok,
       (prompt_text like '%임의 태그나 대괄호 id%')::int          as strategy_ok
  from public.llm_prompts
 where key in ('company_insight', 'strategy_report');


-- ═══════════════════════════════════════════════════════════════════════════
-- ② 305 — 콘텐츠 조회 계측이 실제로 쌓이는가
--    ⚠️ 콘텐츠 상세 페이지를 한 번이라도 연 다음에 실행해야 의미가 있습니다.
--
--    읽는 법:
--      조회기록_건수 = 0  → 🔴 RLS 가 insert 를 막고 있다 (③ 을 함께 보세요)
--      체류시간_기록됨 = 0 → PATCH 가 안 오고 있다
--      둘 다 > 0          → ✅ 정상
-- ═══════════════════════════════════════════════════════════════════════════
select
  count(*)                                  as 조회기록_건수,
  count(*) filter (where dwell_seconds > 0) as 체류시간_기록됨,
  max(viewed_at)                            as 최근_기록
from public.content_views;


-- ═══════════════════════════════════════════════════════════════════════════
-- ③ 305 — content_views 의 RLS 정책 (②가 0일 때만 의미 있음)
--    insert 를 허용하는 정책이 있어야 합니다.
-- ═══════════════════════════════════════════════════════════════════════════
select policyname, cmd, roles, permissive
  from pg_policies
 where schemaname = 'public' and tablename = 'content_views'
 order by cmd;


-- ═══════════════════════════════════════════════════════════════════════════
-- ④ ⭐ 313 — 역참조("이 기사를 인용한 리포트·인사이트")가 붙을 콘텐츠가 있는가
--
--    이게 가장 중요합니다.
--      전부 0 → 🔴 313 을 배포해도 빈 화면입니다.
--               근거 적재(276)가 조용히 실패하고 있다는 뜻이고, 그게 진짜 문제입니다.
--      하나라도 > 0 → ✅ 313 이 실제로 보여줄 게 있습니다.
-- ═══════════════════════════════════════════════════════════════════════════
with c as (
  select id from public.contents where status = 'published' limit 500
)
select
  (select count(*) from public.ai_report_sources s join c on s.content_id = c.id) as 전략보고서,
  (select count(*) from public.issue_contents   s join c on s.content_id = c.id) as AI인사이트,
  (select count(*) from public.insight_cards    k, c where k.source_content_ids @> array[c.id]) as 기업인사이트,
  (select count(*) from public.briefings        b, c where b.source_content_ids @> array[c.id]) as 모닝브리핑;


-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ 310 — 뉴스 요약이 실제로 채워지고 있는가
--    ⚠️ /admin/ai-jobs 에서 "본문 수집" → "뉴스 요약 백필" 을 돌린 다음에 실행하세요.
--
--    읽는 법:
--      요약있음 = 0                      → 🔴 백필이 안 돌았거나 실패했다
--      시도했으나_요약없음 이 크다        → LLM 호출은 했는데 실패했다 (한도? 키?)
--      본문없어_대기 가 크다              → body-backfill(본문 수집)이 안 돌고 있다
--                                          → 요약보다 본문이 먼저다
-- ═══════════════════════════════════════════════════════════════════════════
select
  count(*)                                                          as 발행_콘텐츠,
  count(*) filter (where summary_ko is not null)                    as 요약있음,
  count(*) filter (where summary_ko is null
                     and summary_attempted_at is not null)          as 시도했으나_요약없음,
  count(*) filter (where summary_ko is null
                     and summary_attempted_at is null
                     and coalesce(body_len, 0) < 200
                     and category <> '유튜브')                       as 본문없어_대기,
  count(*) filter (where summary_ko is null
                     and summary_attempted_at is null
                     and (coalesce(body_len, 0) >= 200 or category = '유튜브')) as 요약가능_대기
from public.contents
where status = 'published';
