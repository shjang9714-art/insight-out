-- 224 경쟁사 그룹핑 — entities.competitor_group + 백필
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 목적: 경쟁사(동향) 탭이 insight_cards를 competitor_group(통신/클라우드·플랫폼/빅테크)으로 재그룹핑.
-- 그룹은 어드민(EntityManager)에서 편집 가능 — 아래는 초기 백필값(추후 변경 가정).

begin;

-- ── 1. 컬럼 추가 ─────────────────────────────────────────────────────────────
alter table public.entities
  add column if not exists competitor_group text;   -- '통신' | '클라우드·플랫폼' | '빅테크' | null(자유텍스트 허용)

create index if not exists entities_competitor_group_idx
  on public.entities (competitor_group)
  where competitor_group is not null;

-- ── 2. 백필 — 통신 ───────────────────────────────────────────────────────────
update public.entities
set competitor_group = '통신', is_competitor = true
where lower(canonical_name) in (
  'skt','sk텔레콤','sk telecom','kt','sk브로드밴드','sk broadband','세종텔레콤'
);

-- ── 3. 백필 — 클라우드·플랫폼 ─────────────────────────────────────────────────
update public.entities
set competitor_group = '클라우드·플랫폼', is_competitor = true
where lower(canonical_name) in (
  '네이버클라우드','naver cloud','ncp','카카오엔터프라이즈','kakao enterprise','nhn cloud','nhn클라우드'
);

-- ── 4. 백필 — 빅테크 ─────────────────────────────────────────────────────────
update public.entities
set competitor_group = '빅테크', is_competitor = true
where lower(canonical_name) in (
  'aws','amazon web services','microsoft','azure','ms azure','google','google cloud','gcp','oracle','오라클'
);

-- ── 5. 별칭(entity_aliases)까지 커버 — 별칭이 위 목록과 매칭되면 부모 엔티티에 그룹 부여 ──
-- (canonical_name이 한글/영문 어느 쪽이든 별칭 기준으로도 그룹이 붙도록 보정)
update public.entities e
set competitor_group = grp.g, is_competitor = true
from (
  select a.entity_id,
         case
           when lower(a.alias) in ('skt','sk텔레콤','sk telecom','kt','sk브로드밴드','sk broadband','세종텔레콤') then '통신'
           when lower(a.alias) in ('네이버클라우드','naver cloud','ncp','카카오엔터프라이즈','kakao enterprise','nhn cloud','nhn클라우드') then '클라우드·플랫폼'
           when lower(a.alias) in ('aws','amazon web services','microsoft','azure','ms azure','google','google cloud','gcp','oracle','오라클') then '빅테크'
           else null
         end as g
  from public.entity_aliases a
) grp
where grp.entity_id = e.id
  and grp.g is not null
  and e.competitor_group is null;

commit;

-- ============================================================
-- 검증
-- ============================================================
select competitor_group, count(*) as cnt
from public.entities
where competitor_group is not null
group by competitor_group
order by 1;

select canonical_name, competitor_group, is_competitor
from public.entities
where competitor_group is not null
order by competitor_group, canonical_name;

-- 참고: 매칭 안 된 경쟁사(다른 표기)는 어드민 EntityManager에서 competitor_group 직접 지정.
-- 그룹 변경/추가도 어드민에서 자유 텍스트로 가능(예: '보안', '데이터센터' 등 추후).
