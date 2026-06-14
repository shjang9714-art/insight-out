-- ============================================================================
-- 소스 그룹핑 — sources.group_name 컬럼 추가 + 대표군 백필
-- ----------------------------------------------------------------------------
-- 목적: "Google News - A", "Google News - B" 처럼 과세분화된 RSS 피드를
--       대표군(Google News, AWS, Cloudflare ...) 으로 묶어 필터/표시.
-- 실행: 수희 핸드오프 — Supabase SQL Editor 에서 1회 실행.
-- 후속: schema.sql 갱신 + 어드민 SourceManager group_name 필드 + 필터 UI 그룹화
--       + 크롤러 신규 소스 group 기본값 → 지시서 43 에서 코드로 반영.
-- 주의: 멱등(idempotent) 설계 — 재실행 안전.
-- ============================================================================

-- 1) 컬럼 추가 (nullable — 백필 후 UI 는 group_name ?? name 으로 폴백)
alter table public.sources
  add column if not exists group_name text;

-- 2) 대표군 백필
--    우선순위: 알려진 대형 발행처(ilike) → 일반 ' - ' prefix → 이름 그대로.
--    이미 group_name 이 채워진 행은 건드리지 않음(수동 조정 보존).
update public.sources
set group_name = case
    when name ilike 'Google News%' then 'Google News'
    when name ilike 'AWS%'         then 'AWS'
    when name ilike 'Cloudflare%'  then 'Cloudflare'
    when name ilike 'Cisco%'       then 'Cisco'
    when name ilike 'Google Cloud%' then 'Google Cloud'
    when name like '% - %'         then split_part(name, ' - ', 1)
    else name
  end
where group_name is null;

-- 3) 그룹 필터용 인덱스
create index if not exists sources_group_name_idx
  on public.sources (group_name);

-- 4) 확인용 (실행 후 그룹별 소스 수 점검 — 결과만 보고 커밋 X)
-- select group_name, count(*) as n
-- from public.sources
-- group by group_name
-- order by n desc, group_name;
