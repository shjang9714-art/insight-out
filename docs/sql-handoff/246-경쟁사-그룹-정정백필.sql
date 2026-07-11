-- 246 경쟁사 그룹 정정 백필 — "기타 경쟁사" 해소 + 노이즈/자사 정리 + 빅테크 편입
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 근거: 2026-07-09 라이브 /admin/entities 실측 — is_competitor=true 목록의 실제 canonical_name 대조.
--   224 백필이 일부 미반영 + 노이즈(AX·AI전환)·자사(LG유플러스) 경쟁사 오플래그 + 빅테크 미편입 발견.
-- 정확한 canonical_name 기준(대소문자 무관)으로 명시 지정 → 멱등.

begin;

-- ── 0. 컬럼 보장 (224 미적용 대비 — 자체 포함) ────────────────────────────────
-- 확인 결과 competitor_group 컬럼이 없어(224 SQL 미적용) 246이 42703으로 실패 → 여기서 직접 생성.
alter table public.entities
  add column if not exists competitor_group text;
create index if not exists entities_competitor_group_idx
  on public.entities (competitor_group) where competitor_group is not null;

-- ── 1. 통신 ──────────────────────────────────────────────────────────────────
update public.entities
set competitor_group = '통신', is_competitor = true
where lower(canonical_name) in ('kt','skt','세종텔레콤','sk브로드밴드','kt ai');

-- ── 2. 클라우드·플랫폼 ───────────────────────────────────────────────────────
update public.entities
set competitor_group = '클라우드·플랫폼', is_competitor = true
where lower(canonical_name) in ('네이버클라우드','카카오엔터프라이즈','nhn cloud','kt클라우드');

-- ── 3. 빅테크 (기업이나 경쟁사 미플래그였음 → 편입) ────────────────────────────
update public.entities
set competitor_group = '빅테크', is_competitor = true
where lower(canonical_name) in ('aws','microsoft','google cloud','oracle','nvidia','azure');

-- ── 4. 노이즈·자사 정리 (경쟁사 아님) ────────────────────────────────────────
--   AX·AI전환=개념(회사 아님), LG유플러스=자사 → 경쟁사에서 제외 + 그룹 제거.
update public.entities
set is_competitor = false, competitor_group = null
where lower(canonical_name) in ('ax','ai전환','lg유플러스','lg u+','lgu+');

commit;

-- ============================================================
-- 검증
-- ============================================================
-- 그룹별 경쟁사 분포 (기타=competitor_group null 이면서 is_competitor=true)
select coalesce(competitor_group, '(미지정)') as grp, count(*) as cnt
from public.entities
where is_competitor = true
group by competitor_group
order by 1;

-- 남은 미지정 경쟁사 확인 → 있으면 어드민에서 개별 지정
select canonical_name, mention_count
from public.entities
where is_competitor = true and competitor_group is null
order by mention_count desc;
