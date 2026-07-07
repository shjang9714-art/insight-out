-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- 홈 "실시간 급상승 키워드"(#104) 뷰: 이슈 클러스터 단위 최근 48h 발행건수 기반 급상승 판정.
-- 전제(2026-07-08 Step 0 실측): issues 테이블에 archived_at·merged_into 컬럼 없음 →
-- status='published' 필터로 아카이브 제외(draft·archived 제외). 병합(merge) 개념은 현재 스키마에 없음.
-- 시각 기준은 contents.published_at이 아닌 collected_at 사용(published_at 결측 다수 — 기존 이슈 활동량 집계와 동일 원칙).
create or replace view public.trending_keywords as
select
  i.id    as issue_id,
  i.title,
  count(c.id) filter (
    where c.collected_at >= now() - interval '48 hours'
  )       as recent_count,
  count(c.id) filter (
    where c.collected_at >= now() - interval '96 hours'
      and c.collected_at <  now() - interval '48 hours'
  )       as prev_count
from public.issues i
join public.issue_contents ic on ic.issue_id = i.id
join public.contents c        on c.id = ic.content_id
where i.status = 'published'
group by i.id, i.title
having count(c.id) filter (where c.collected_at >= now() - interval '48 hours') >= 2
order by recent_count desc;

-- ★ GRANT 필수 (2026-05-30 이후 Data API 기본 비노출)
grant select on public.trending_keywords to anon, authenticated;

-- ── 확인 쿼리 (실행 후 상위 10건 반환되는지 확인) ──────────────────────────
select issue_id, title, recent_count, prev_count
from public.trending_keywords
limit 10;
