-- 225 관심기업 엔티티 연결 — user_watchlist.entity_id FK + 마이그레이션
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 목적: 관심기업을 자유텍스트(company)에서 entities 연결(entity_id)로 승격 → 콘텐츠 필터를 엔티티 기준으로 교정.
--   company 텍스트는 유지(표시·미매칭 폴백). 매칭 안 된 수동입력은 entity_id null 로 남고 문자열 폴백.

begin;

alter table public.user_watchlist
  add column if not exists entity_id uuid references public.entities (id) on delete set null;

create index if not exists user_watchlist_entity_idx
  on public.user_watchlist (entity_id) where entity_id is not null;

-- ── 마이그레이션 1: canonical_name 정확일치(회사 타입) ────────────────────────
update public.user_watchlist w
set entity_id = e.id
from public.entities e
where w.entity_id is null
  and e.entity_type = 'company'
  and lower(e.canonical_name) = lower(w.company);

-- ── 마이그레이션 2: 별칭 정확일치 ────────────────────────────────────────────
update public.user_watchlist w
set entity_id = a.entity_id
from public.entity_aliases a
where w.entity_id is null
  and lower(a.alias) = lower(w.company);

commit;

-- 검증:
-- select count(*) filter (where entity_id is not null) as linked,
--        count(*) filter (where entity_id is null)     as unlinked
-- from public.user_watchlist;
