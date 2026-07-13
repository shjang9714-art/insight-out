-- 312 크롤 제외 건수 기록 — crawl_logs.rejected_count + rejected_by
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN. 멱등.
--
-- 배경:
--   크롤 결과가 이렇다:
--     가져옴 683 → 신규 47 + 중복 179 = 226
--     나머지 457건(67%)이 어디로 갔는지 아무도 모른다.
--
--   코드(orchestrator.ts)는 counts.rejected 를 세고 있는데,
--   crawl_logs 에 해당 컬럼이 없어서 **그냥 버려진다.**
--   화면에도 토스트에도 안 나온다.
--
--   rejected 조건(orchestrator.ts:390-397):
--     - 광고성(isAdLike)
--     - keyword_groups.exclude_patterns 매칭
--     - 유효 길이 미달(MIN_EFFECTIVE_LENGTH)
--     - 본문 최소 길이 미달(crawl_settings.min_body_length, 기본 250)
--     - 제외 규칙 action='reject'
--
--   → 어느 조건이 몇 건을 버리는지 알아야 튜닝할 수 있다.
--     (본문 최소 길이 하나가 수백 건을 버리고 있을 수 있다)

begin;

-- ── 1. 제외 건수 ─────────────────────────────────────────────────────────────
alter table public.crawl_logs
  add column if not exists rejected_count integer not null default 0;

comment on column public.crawl_logs.rejected_count is
  '품질 게이트·제외 규칙으로 버려진 건수(312). fetched = inserted + duplicate + held + rejected 가 맞아야 한다.';

-- ── 2. 제외 사유 분해 ────────────────────────────────────────────────────────
-- 조건이 앞으로 늘어나므로 컬럼을 쪼개지 않고 jsonb 하나로 받는다.
-- 예: {"ad": 12, "excludedGroup": 5, "tooShort": 380, "bodyTooShort": 0, "excludeRule": 60}
alter table public.crawl_logs
  add column if not exists rejected_by jsonb;

comment on column public.crawl_logs.rejected_by is
  '제외 사유별 건수(312). 합계는 rejected_count 와 일치해야 한다.';

commit;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
-- 컬럼이 생겼는지:
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'crawl_logs'
--      and column_name in ('rejected_count', 'rejected_by');
--
-- 312 배포 후 크롤 1회 돌린 뒤 — 합이 맞는지(이게 진짜 검증이다):
--   select source_id,
--          fetched_count,
--          inserted_count + duplicate_count + held_count + rejected_count as 합계,
--          fetched_count - (inserted_count + duplicate_count + held_count + rejected_count) as 차이,
--          rejected_by
--     from public.crawl_logs
--    where created_at > now() - interval '1 day'
--    order by created_at desc
--    limit 20;
--   → '차이' 가 0이 아니면 아직 안 세는 경로가 있다는 뜻이다.
--
-- 제외 사유 전체 집계 (어느 게이트가 가장 많이 버리나):
--   select key as 사유, sum((value)::int) as 건수
--     from public.crawl_logs, jsonb_each(coalesce(rejected_by, '{}'::jsonb))
--    where created_at > now() - interval '7 days'
--    group by 1
--    order by 2 desc;
