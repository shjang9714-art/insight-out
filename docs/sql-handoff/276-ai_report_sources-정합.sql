-- 276 ai_report_sources 정합 — issue_id 컬럼 + CHECK 3항 확장 + 유니크 인덱스
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에). 멱등.
-- 배경(스키마 드리프트, 어드민감사 §7):
--   · supabase/schema.sql 의 ai_report_sources 는 content_id / youtube_video_id 만 정의하고
--     CHECK 가 "정확히 하나"를 요구한다.
--   · 그런데 src/app/api/reports/generate/route.ts 는 { ai_report_id, issue_id } 행을 insert 한다
--     → issue_id 컬럼이 없거나(42703), 있어도 CHECK 위반(content/youtube 둘 다 null)으로 실패.
--     코드가 에러를 console.error 로 삼켜서 그동안 "이슈 출처"가 조용히 누락됐을 수 있음.
--   · 276(전략보고서 어드민)에서 근거(출처) 적재를 켜므로 여기서 정합을 맞춘다.
-- 적용 후 점등: 전략보고서 상세의 "근거"(관련 이슈/콘텐츠) 블록이 실제로 채워짐.

begin;

-- ── 1. issue_id 컬럼 추가(없으면) ────────────────────────────────────────────
alter table public.ai_report_sources
  add column if not exists issue_id uuid references public.issues (id) on delete cascade;

-- ── 2. CHECK 제약을 3항(content / youtube / issue 중 정확히 하나)으로 확장 ──
alter table public.ai_report_sources
  drop constraint if exists ai_report_sources_one_item;

alter table public.ai_report_sources
  add constraint ai_report_sources_one_item check (
    (content_id is not null)::int
  + (youtube_video_id is not null)::int
  + (issue_id is not null)::int = 1
  );

-- ── 3. 이슈 출처 중복 방지 유니크 인덱스 ─────────────────────────────────────
create unique index if not exists ai_report_sources_issue_key
  on public.ai_report_sources (ai_report_id, issue_id) where issue_id is not null;

commit;

-- ── 확인용(선택) ─────────────────────────────────────────────────────────────
-- 컬럼·제약이 의도대로 붙었는지 확인:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'ai_report_sources' order by ordinal_position;
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.ai_report_sources'::regclass and contype = 'c';
