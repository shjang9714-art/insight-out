-- ============================================================
-- 핸드오프 99 — 엔티티 지식계층 토대 (entities + entity_aliases + content_entities)
-- 수희 실행: Supabase → SQL Editor 에서 1회. 멱등(if not exists / on conflict).
-- ⚠️ entity_type 은 enum(값 삭제 어려움) — David 확정 목록으로 실행.
-- 코드는 테이블 미적용이어도 try/catch 격리(크롤 무중단). SSOT: supabase/schema.sql 반영(#6).
-- ============================================================

-- 1) entity_type enum (지식그래프 6분류)
do $$ begin
  create type entity_type as enum ('company', 'tech', 'product', 'person', 'policy', 'industry');
exception when duplicate_object then null; end $$;

-- 2) entities (정규 엔티티)
create table if not exists public.entities (
  id             uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  entity_type    entity_type not null,
  description    text,
  is_competitor  boolean not null default false,
  service_id     uuid references public.services (id) on delete set null,
  mention_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- 같은 표기라도 타입이 다르면 별개 엔티티 허용(예: 제품 vs 기업)
create unique index if not exists entities_canonical_type_key
  on public.entities (lower(canonical_name), entity_type);
create index if not exists entities_type_idx on public.entities (entity_type);

drop trigger if exists set_entities_updated_at on public.entities;
create trigger set_entities_updated_at
  before update on public.entities
  for each row execute function public.set_updated_at();

-- 3) entity_aliases (동의어 사전 — 정규화 핵심. 하나의 alias → 하나의 엔티티)
create table if not exists public.entity_aliases (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references public.entities (id) on delete cascade,
  alias      text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists entity_aliases_alias_key
  on public.entity_aliases (lower(alias));
create index if not exists entity_aliases_entity_idx
  on public.entity_aliases (entity_id);

-- 4) content_entities (콘텐츠 × 엔티티 링크, rule|llm)
create table if not exists public.content_entities (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents (id) on delete cascade,
  entity_id  uuid not null references public.entities (id) on delete cascade,
  source     text not null default 'rule',   -- 'rule'(alias 매칭) | 'llm'(후속 NER)
  score      numeric not null default 1.0,
  created_at timestamptz not null default now(),
  unique (content_id, entity_id)
);
create index if not exists content_entities_content_idx on public.content_entities (content_id);
create index if not exists content_entities_entity_idx  on public.content_entities (entity_id);

-- 5) RLS (인증 조회 + admin 전체; 크롤러는 service_role 로 우회 적재)
alter table public.entities         enable row level security;
alter table public.entity_aliases   enable row level security;
alter table public.content_entities enable row level security;

drop policy if exists "entities: 인증 조회" on public.entities;
create policy "entities: 인증 조회" on public.entities
  for select using (auth.uid() is not null);
drop policy if exists "entities: admin 전체" on public.entities;
create policy "entities: admin 전체" on public.entities
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "entity_aliases: 인증 조회" on public.entity_aliases;
create policy "entity_aliases: 인증 조회" on public.entity_aliases
  for select using (auth.uid() is not null);
drop policy if exists "entity_aliases: admin 전체" on public.entity_aliases;
create policy "entity_aliases: admin 전체" on public.entity_aliases
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "content_entities: 인증 조회" on public.content_entities;
create policy "content_entities: 인증 조회" on public.content_entities
  for select using (auth.uid() is not null);
drop policy if exists "content_entities: admin 전체" on public.content_entities;
create policy "content_entities: admin 전체" on public.content_entities
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 6) 시드 — 기존 큐레이션 데이터로 엔티티 사전 부트스트랩 (LLM 불필요)
-- ============================================================

-- 6a) keyword_groups.include_patterns → 타입별 엔티티
--     tag_type 매핑: tech→tech, company→company, policy→policy, 그 외→industry
insert into public.entities (canonical_name, entity_type, is_competitor)
select sub.pattern,
       sub.etype,
       bool_or(sub.is_comp)
from (
  select trim(p.pattern) as pattern,
         (case kg.tag_type
            when 'tech'    then 'tech'
            when 'company' then 'company'
            when 'policy'  then 'policy'
            else 'industry'
          end)::entity_type as etype,
         (kg.kind = 'competitor') as is_comp
  from public.keyword_groups kg
  cross join lateral unnest(kg.include_patterns) as p(pattern)
  where kg.is_active and length(trim(p.pattern)) > 0
) sub
group by sub.pattern, sub.etype
on conflict (lower(canonical_name), entity_type) do nothing;

-- 6b) user_watchlist.company → company 엔티티
insert into public.entities (canonical_name, entity_type)
select distinct trim(w.company), 'company'::entity_type
from public.user_watchlist w
where length(trim(w.company)) > 0
on conflict (lower(canonical_name), entity_type) do nothing;

-- 6c) 각 엔티티의 canonical_name 을 alias 로 등록(정규화 진입점)
insert into public.entity_aliases (entity_id, alias)
select e.id, e.canonical_name
from public.entities e
on conflict (lower(alias)) do nothing;

-- ============================================================
-- 7) 백필 — 기존 콘텐츠 matched_keywords ↔ 엔티티(alias) 링크 (rule)
-- ============================================================
insert into public.content_entities (content_id, entity_id, source)
select c.id, a.entity_id, 'rule'
from public.contents c
join public.entity_aliases a on a.alias = any(c.matched_keywords)
on conflict (content_id, entity_id) do nothing;

-- 8) mention_count 갱신(선택 — 정렬·랭킹용)
update public.entities e
set mention_count = sub.cnt
from (
  select entity_id, count(*) as cnt
  from public.content_entities group by entity_id
) sub
where sub.entity_id = e.id;

-- 9) 검증
select entity_type, count(*) from public.entities group by entity_type order by 2 desc;
select count(*) as content_entity_links from public.content_entities;
