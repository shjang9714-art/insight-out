-- ============================================================
-- weekly_flows RLS 정책 추가 (지시서 20260716 §1-A 보완)
-- 실행: Supabase 대시보드 → SQL Editor (수희)
-- 배경: 원래 SQL이 grant만 있고 RLS+정책이 없어서, 다른 테이블(daily_insights 등)처럼
--   RLS가 프로젝트 기본값으로 켜져 있으면 authenticated 사용자에게 0건으로 필터링됨
--   ("이번 주 한눈에 보는 흐름"이 웹에 안 보이는 버그의 유력 원인).
-- ============================================================

alter table public.weekly_flows enable row level security;

drop policy if exists "weekly_flows: 인증 사용자 조회" on public.weekly_flows;
create policy "weekly_flows: 인증 사용자 조회"
  on public.weekly_flows for select
  using (auth.role() = 'authenticated');

drop policy if exists "weekly_flows: admin 관리" on public.weekly_flows;
create policy "weekly_flows: admin 관리"
  on public.weekly_flows for all
  using (public.is_admin())
  with check (public.is_admin());

-- 확인 쿼리
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename='weekly_flows';
select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='weekly_flows';
