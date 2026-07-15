-- ============================================================
-- 핵심 Insight 주간 복귀 — daily_insights 컬럼 추가 (week_of, competitor_matrix)
-- 지시서: 지시서_20260715_핵심인사이트-주간복귀-홈카드밀도개선.md (§4)
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 실측(2026-07-15): 라이브 daily_insights 컬럼 확인 결과 week_of / competitor_matrix
--   둘 다 존재하지 않음. 신규 테이블 생성 아님 — 기존 daily_insights 재사용.
-- 참고: key_insights(주간, 은퇴)는 이 작업에서 건드리지 않음. 하드 삭제 없음.
-- ============================================================

-- ── 1) 컬럼 추가 ─────────────────────────────────────────────
-- week_of: 배치 주차 키(월요일 시작일). 목록 페이지 주차 그룹핑·주차 선택기·홈 로테이션 기준.
alter table public.daily_insights add column if not exists week_of date;

-- competitor_matrix: §2.5① 상세 페이지 경쟁 구도 매트릭스용.
-- [{"company":"LG U+","move":"...","edge":"...","risk":"..."}] — 근거 기사에 등장한 사업자만.
alter table public.daily_insights add column if not exists competitor_matrix jsonb;

-- ── 2) 인덱스 ─────────────────────────────────────────────────
create index if not exists daily_insights_week_idx
  on public.daily_insights (week_of desc, display_order asc);

-- ── 3) (선택) 기존 행 week_of 백필 ────────────────────────────
-- day_of 기준 그 주 월요일로 채워, 과거 일일 행도 목록 페이지에서 자연스럽게 그룹핑되게 함.
update public.daily_insights
set week_of = (date_trunc('week', day_of)::date)
where week_of is null and day_of is not null;

-- ── 4) 확인 쿼리 ───────────────────────────────────────────────
-- 4-1) 컬럼 존재 확인
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'daily_insights'
  and column_name in ('week_of', 'competitor_matrix');

-- 4-2) 인덱스 존재 확인
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'daily_insights'
  and indexname = 'daily_insights_week_idx';

-- 4-3) 백필 결과 확인 (주차별 published 건수)
select week_of, count(*) filter (where status = 'published') as published
from public.daily_insights
group by week_of
order by week_of desc nulls last;
