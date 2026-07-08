-- 220 near-dup 재클러스터링(본문 유사도) — contents.cluster_checked_at 마커
-- 핸드오프: 수희 → Supabase SQL Editor 실행. 멱등.
-- 목적: 뉴스 재클러스터링 백필이 각 기사를 1회씩만 재평가하도록 표시하는 마커.
--   null = 미평가(백필 대상). 값 있으면 재평가 완료 → 재드레인 제외(무한 재평가 방지).
--   미적용(42703) 시 코드는 ready:false 로 degrade("220 SQL 적용 필요"), 크롤·표시 안 깨짐.
-- 관련: 지시서 220.

alter table public.contents add column if not exists cluster_checked_at timestamptz;

comment on column public.contents.cluster_checked_at is
  '관련기사 재클러스터링(본문 유사도) 재평가 시각(지시서 220). null=미평가(백필 대상). 성공·무매칭 무관 1회 평가 후 기록.';

create index if not exists idx_contents_cluster_recheck
  on public.contents (collected_at desc)
  where category = '뉴스' and cluster_checked_at is null;

-- 확인:
-- select count(*) as 재평가대상 from public.contents
--   where category = '뉴스' and cluster_checked_at is null and body_fetched_at is not null;
