-- ★ 실행 필요: Supabase SQL Editor에서 직접 실행
-- §6 일자별 급상승 히스토리 — 매일 KST 자정 직전 그날의 "오늘의 급상승" Top N을 스냅샷으로 적재.
-- issues.id/contents.id는 모두 uuid(실측 확인, 2026-07-12).

create table public.trending_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  rank int not null,
  issue_id uuid not null references public.issues (id) on delete cascade,
  content_id uuid references public.contents (id) on delete set null,
  headline text not null,
  hashtag text,
  today_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (snapshot_date, rank)
);

create index trending_snapshots_date_idx on public.trending_snapshots (snapshot_date desc, rank);

alter table public.trending_snapshots enable row level security;

create policy "trending_snapshots: 조회는 누구나"
  on public.trending_snapshots for select using (true);

create policy "trending_snapshots: admin 관리"
  on public.trending_snapshots for all using (public.is_admin()) with check (public.is_admin());

grant select on public.trending_snapshots to anon, authenticated;

-- ── 확인 쿼리 (cron 최초 실행 후 최근 스냅샷이 잘 쌓였는지 확인) ──
select snapshot_date, rank, headline, hashtag, today_count
from public.trending_snapshots
order by snapshot_date desc, rank
limit 20;
