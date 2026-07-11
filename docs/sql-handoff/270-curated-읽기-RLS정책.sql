-- 270 큐레이션 테이블 클라이언트 읽기 허용 (RLS SELECT 정책)
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에). 멱등.
-- 증상: "주요 기업 설정" 모달에 회사 목록이 안 뜸(칩 없음, 에러도 없음).
-- 원인: curated_groups/curated_companies/llm_prompts 는 253에서 생성됐으나 RLS 읽기 정책이 없어
--       브라우저(authenticated) 조회가 빈 배열 반환(서버 service_role 은 우회되어 정상).
-- 조치: 세 테이블에 인증 사용자 SELECT 정책 + grant. (쓰기는 계속 service_role/admin 만 → 서비스 코드가 처리)
--       curated 목록은 사내 공개 참조 데이터라 읽기 개방 안전.

begin;

-- ── curated_groups ───────────────────────────────────────────────────────────
alter table public.curated_groups enable row level security;
drop policy if exists "curated_groups read" on public.curated_groups;
create policy "curated_groups read" on public.curated_groups
  for select to authenticated, anon using (true);
grant select on public.curated_groups to authenticated, anon;

-- ── curated_companies ────────────────────────────────────────────────────────
alter table public.curated_companies enable row level security;
drop policy if exists "curated_companies read" on public.curated_companies;
create policy "curated_companies read" on public.curated_companies
  for select to authenticated, anon using (true);
grant select on public.curated_companies to authenticated, anon;

-- ── llm_prompts ──────────────────────────────────────────────────────────────
-- (어드민 프롬프트 관리 UI가 클라이언트에서 읽을 수 있게 — 쓰기는 admin/서버만)
alter table public.llm_prompts enable row level security;
drop policy if exists "llm_prompts read" on public.llm_prompts;
create policy "llm_prompts read" on public.llm_prompts
  for select to authenticated using (true);
grant select on public.llm_prompts to authenticated;

commit;

-- ============================================================
-- 검증
-- ============================================================
-- 1) watchlist 그룹 7개 존재 확인(모달이 kind='watchlist' 로 조회)
select key, label, sort_order
from public.curated_groups
where kind = 'watchlist' and is_active = true
order by sort_order;

-- 2) watchlist 그룹별 회사 수(모달 칩 소스) — 각 그룹에 회사가 붙어야 함
select g.key, g.label, count(c.*) as companies
from public.curated_groups g
left join public.curated_companies c
  on c.is_active and g.key = any(c.groups)
where g.kind = 'watchlist' and g.is_active
group by g.key, g.label, g.sort_order
order by g.sort_order;

-- 3) 정책 적용 확인
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('curated_groups','curated_companies','llm_prompts')
order by tablename, policyname;
