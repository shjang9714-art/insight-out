-- 지시서 93 — user_watchlist (관심업체 워치리스트, per-user 자유추가)
-- 담당: 수희(Supabase SQL Editor). 코드 배포 전 선적용. 멱등 작성.

create table if not exists public.user_watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  company    text not null,                 -- 자유 입력 업체명
  created_at timestamptz not null default now()
);

-- 동일 사용자 중복 업체 방지(대소문자 무시)
create unique index if not exists user_watchlist_user_company_key
  on public.user_watchlist (user_id, lower(company));
create index if not exists user_watchlist_user_idx
  on public.user_watchlist (user_id);

alter table public.user_watchlist enable row level security;

drop policy if exists "user_watchlist: 본인 관리" on public.user_watchlist;
create policy "user_watchlist: 본인 관리"
  on public.user_watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
