-- ============================================================
-- 지시서 56 — keyword_groups.search_seeds 컬럼 추가
-- 수희 실행: Supabase Dashboard → SQL Editor 에서 1회 실행
-- ============================================================

-- keyword_groups 에 Google News 검색 시드 추가
alter table public.keyword_groups
  add column search_seeds text[] not null default '{}';

-- (선택) 일부 그룹 초기 시드 — 운영하며 어드민/SQL 로 확장
update public.keyword_groups set search_seeds = array['AICC','AI 컨택센터','콜센터 AI']
  where kind = 'aicc';
update public.keyword_groups set search_seeds = array['AI 데이터센터','GPU 클라우드','코로케이션']
  where kind = 'aidc';
update public.keyword_groups set search_seeds = array['Private 5G','5G 특화망','네트워크 슬라이싱']
  where kind = 'telecom_b2b';
update public.keyword_groups set search_seeds = array['스마트팩토리','산업 AI','OT 보안']
  where kind = 'manufacturing_dx';
update public.keyword_groups set search_seeds = array['피지컬 AI','휴머노이드 로봇']
  where kind = 'physical_ai';
