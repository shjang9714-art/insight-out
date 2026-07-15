-- 355-A 기업·기술 자료 — DART 수집 데이터 모델
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN.
-- 주의: 첫 enum ALTER는 PostgreSQL 제약상 트랜잭션 블록 밖에서 실행한다.

alter type public.content_category add value if not exists '기업자료';

begin;

create table if not exists public.company_documents (
  content_id       uuid primary key references public.contents (id) on delete cascade,
  entity_id        uuid references public.entities (id) on delete set null,
  doc_type         text not null check (doc_type in ('회사소개', 'IR·실적', '전략·보고서', 'ESG', '기술·제품', '투자·피치덱', '행사·발표')),
  doc_group        text not null check (doc_group in ('회사및사업', '기술및제품', '투자및경영')),
  is_official      boolean not null default false,
  source_kind      text not null check (source_kind in ('API', 'RSS', 'SITEMAP', 'HTML_LIST', 'HTML_DETAIL', 'DOCUMENT_DIRECTORY', 'HEADLESS_BROWSER', 'MANUAL')),
  page_count       integer check (page_count is null or page_count > 0),
  published_on     date,
  official_status  text not null default '공식원문링크',
  access_scope     text not null default 'public',
  version_group_id uuid,
  prev_content_id  uuid references public.contents (id) on delete set null,
  ingest_status    text not null default 'auto',
  review_status    text not null default 'none',
  dart_rcept_no    text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists company_documents_entity_published_idx
  on public.company_documents (entity_id, published_on desc);
create index if not exists company_documents_review_idx
  on public.company_documents (review_status, created_at desc);
drop trigger if exists set_company_documents_updated_at on public.company_documents;
create trigger set_company_documents_updated_at
  before update on public.company_documents
  for each row execute function public.set_updated_at();

create table if not exists public.document_sources (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references public.entities (id) on delete cascade,
  name              text not null,
  url               text not null,
  source_kind       text not null check (source_kind in ('API', 'RSS', 'SITEMAP', 'HTML_LIST', 'HTML_DETAIL', 'DOCUMENT_DIRECTORY', 'HEADLESS_BROWSER', 'MANUAL')),
  collect_method    text not null,
  target_file_types text[] not null default '{}',
  interval_minutes  integer check (interval_minutes is null or interval_minutes > 0),
  last_crawled_at   timestamptz,
  last_success_at   timestamptz,
  is_active         boolean not null default true,
  error_state       text,
  auto_publish      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (entity_id, url)
);
create index if not exists document_sources_entity_idx
  on public.document_sources (entity_id, is_active);
drop trigger if exists set_document_sources_updated_at on public.document_sources;
create trigger set_document_sources_updated_at
  before update on public.document_sources
  for each row execute function public.set_updated_at();

create table if not exists public.entity_dart_map (
  entity_id  uuid primary key references public.entities (id) on delete cascade,
  corp_code  text not null unique check (corp_code ~ '^[0-9]{8}$'),
  corp_name  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_entity_dart_map_updated_at on public.entity_dart_map;
create trigger set_entity_dart_map_updated_at
  before update on public.entity_dart_map
  for each row execute function public.set_updated_at();

alter table public.company_documents enable row level security;
alter table public.document_sources enable row level security;
alter table public.entity_dart_map enable row level security;

drop policy if exists "company_documents: 인증 조회" on public.company_documents;
create policy "company_documents: 인증 조회" on public.company_documents
  for select using (auth.uid() is not null);
drop policy if exists "document_sources: 인증 조회" on public.document_sources;
create policy "document_sources: 인증 조회" on public.document_sources
  for select using (auth.uid() is not null);
drop policy if exists "entity_dart_map: 인증 조회" on public.entity_dart_map;
create policy "entity_dart_map: 인증 조회" on public.entity_dart_map
  for select using (auth.uid() is not null);

grant select on public.company_documents, public.document_sources, public.entity_dart_map to authenticated;
grant all on public.company_documents, public.document_sources, public.entity_dart_map to service_role;

-- curated_companies(253)에 entity_id FK가 있으므로 기업 분류는 해당 FK를 그대로 재사용한다.
-- 아래 값은 DART 공식 회사 탐색 페이지의 8자리 고유번호로 확인한 초기 수집 대상이다.
insert into public.entity_dart_map (entity_id, corp_code, corp_name)
select e.id, seed.corp_code, seed.corp_name
from (values
  ('LG유플러스', '00231363', 'LG유플러스'),
  ('SK텔레콤',   '00159023', 'SK텔레콤'),
  ('KT',         '00190321', '케이티'),
  ('삼성전자',   '00126380', '삼성전자')
) as seed(canonical_name, corp_code, corp_name)
join public.entities e
  on e.entity_type = 'company' and lower(e.canonical_name) = lower(seed.canonical_name)
on conflict (entity_id) do update set
  corp_code = excluded.corp_code,
  corp_name = excluded.corp_name,
  updated_at = now();

commit;

-- 검증
select count(*) as company_documents from public.company_documents;
select m.corp_code, m.corp_name, e.canonical_name
from public.entity_dart_map m
join public.entities e on e.id = m.entity_id
order by m.corp_name;
