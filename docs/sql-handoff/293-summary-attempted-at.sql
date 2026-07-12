-- 293 크롤-요약분리: 요약 시도 마커. 멱등.
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
--
-- 배경: summarize(요약 생성)를 크롤 크리티컬 패스에서 빼서 신규 크론
-- /api/cron/summary-backfill(05:20 KST)로 이관한다(지시서_20260712_크롤-요약분리-타임아웃해결.md).
-- summary_ko IS NULL 만으로 드레인 대상을 고르면, 본문이 짧아 영구히 요약 불가한 행이
-- 매일 같은 쿼리에 다시 걸려 무한 재시도된다(body_fetched_at/signals_classified_at과 동일 문제).
-- summary_attempted_at 을 "시도 완료" 마커로 둬서 성공/실패 관계없이 1회만 시도하게 한다.

alter table public.contents
  add column if not exists summary_attempted_at timestamptz;

create index if not exists contents_summary_pending_idx
  on public.contents (collected_at desc)
  where status = 'published' and summary_ko is null and summary_attempted_at is null;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
--   select count(*) from public.contents
--    where status = 'published' and summary_ko is null and summary_attempted_at is null;
