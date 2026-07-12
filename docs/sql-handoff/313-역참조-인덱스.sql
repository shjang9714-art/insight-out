-- 313 역참조 인덱스 — "이 기사를 인용한 리포트·인사이트"
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN. 멱등.
--
-- 배경:
--   콘텐츠 상세에서 "이 기사를 인용한 리포트·인사이트"를 역조회한다.
--   근거는 이미 4곳에 적재되고 있다(새로 만들 데이터 없음):
--
--     전략보고서     ai_report_sources.content_id     ← FK + 인덱스 있음  ✅
--     AI 인사이트    issue_contents.content_id        ← FK + 인덱스 있음  ✅
--     기업 인사이트  insight_cards.source_content_ids  ← uuid[]  🔴 인덱스 없음
--     모닝브리핑     briefings.source_content_ids      ← uuid[]  🔴 인덱스 없음
--
--   uuid[] 역조회(`source_content_ids @> array[:id]`)는 GIN 인덱스가 없으면
--   테이블 전체를 훑는다. 콘텐츠 상세를 열 때마다 발생하므로 인덱스를 건다.
--
-- ⚠️ 인덱스가 없어도 **동작은 한다**(느릴 뿐). 313 배포와 순서 무관.

begin;

-- ── 기업 인사이트 (insight_cards.source_content_ids) ─────────────────────────
create index if not exists insight_cards_source_content_ids_gin
  on public.insight_cards using gin (source_content_ids);

-- ── 모닝브리핑 (briefings.source_content_ids) ────────────────────────────────
create index if not exists briefings_source_content_ids_gin
  on public.briefings using gin (source_content_ids);

commit;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
-- 인덱스가 생겼는지:
--   select indexname, tablename
--     from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('insight_cards_source_content_ids_gin',
--                        'briefings_source_content_ids_gin');
--
-- 역참조가 실제로 붙는 콘텐츠가 있는지 (313 배포 전에 미리 볼 수 있다):
--   with c as (select id from public.contents where status = 'published' limit 500)
--   select
--     (select count(*) from public.ai_report_sources s join c on s.content_id = c.id) as 전략보고서,
--     (select count(*) from public.issue_contents   s join c on s.content_id = c.id) as AI인사이트,
--     (select count(*) from public.insight_cards    k, c where k.source_content_ids @> array[c.id]) as 기업인사이트,
--     (select count(*) from public.briefings        b, c where b.source_content_ids @> array[c.id]) as 모닝브리핑;
--
--   → 전부 0이면 근거가 적재되지 않고 있다는 뜻이다(276 문제 재발). 그러면 313을 붙여도 빈 화면이다.
--     ⭐ 이 쿼리 결과를 David 에게 알려주세요.
