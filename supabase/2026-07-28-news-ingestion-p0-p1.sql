-- News Ingestion P0/P1
-- 기사 발견과 본문 처리를 분리하고, 복수 수집원의 발견 출처를 보존한다.

alter table public.sources
  add column if not exists adapter_key text not null default 'generic-rss',
  add column if not exists parser_version text not null default 'generic-v1',
  add column if not exists priority smallint not null default 50,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_article_at timestamptz,
  add column if not exists consecutive_zero_runs integer not null default 0;

alter table public.sources
  drop constraint if exists sources_priority_check,
  add constraint sources_priority_check check (priority between 0 and 100),
  drop constraint if exists sources_consecutive_zero_runs_check,
  add constraint sources_consecutive_zero_runs_check check (consecutive_zero_runs >= 0);

create table if not exists public.article_candidates (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique,
  original_url text not null,
  canonical_url text not null,
  normalized_title text not null,
  title text not null,
  body_snippet text,
  author text,
  language text not null default 'ko',
  thumbnail_url text,
  published_at timestamptz,
  source_id uuid references public.sources(id) on delete set null,
  source_type public.source_type not null default 'news_site',
  trust_tier smallint not null default 1,
  first_provider text not null,
  first_query text,
  stage text not null default 'discovered',
  state text not null default 'queued',
  priority smallint not null default 50,
  attempt_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text,
  last_error_detail text,
  content_id uuid references public.contents(id) on delete set null,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_candidates_provider_check check (
    first_provider in (
      'direct_rss', 'direct_sitemap', 'naver', 'google', 'gdelt_doc',
      'gdelt_bigquery', 'bigkinds', 'newsapi', 'manual'
    )
  ),
  constraint article_candidates_stage_check check (
    stage in (
      'discovered', 'url_resolved', 'content_pending', 'content_fetched',
      'parsed', 'validated', 'persisted'
    )
  ),
  constraint article_candidates_state_check check (
    state in ('queued', 'processing', 'retry_wait', 'completed', 'discarded', 'dead_letter')
  ),
  constraint article_candidates_priority_check check (priority between 0 and 100),
  constraint article_candidates_attempt_count_check check (attempt_count >= 0),
  constraint article_candidates_trust_tier_check check (trust_tier between 0 and 3)
);

comment on table public.article_candidates is
  '기사 발견과 본문 처리 사이의 영속 큐. contents.status와 수집 처리 상태를 분리한다.';

create table if not exists public.candidate_discoveries (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.article_candidates(id) on delete cascade,
  discovery_key text not null unique,
  provider text not null,
  provider_item_id text,
  source_id uuid references public.sources(id) on delete set null,
  query text,
  raw_metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint candidate_discoveries_provider_check check (
    provider in (
      'direct_rss', 'direct_sitemap', 'naver', 'google', 'gdelt_doc',
      'gdelt_bigquery', 'bigkinds', 'newsapi', 'manual'
    )
  )
);

comment on table public.candidate_discoveries is
  '동일 기사 후보를 발견한 모든 제공자와 검색 시드를 보존하는 출처 이력.';

create table if not exists public.candidate_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.article_candidates(id) on delete cascade,
  stage text not null,
  result text not null,
  error_code text,
  error_detail text,
  http_status integer,
  parser_version text,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint candidate_attempts_result_check check (
    result in ('success', 'failed', 'retry', 'discarded')
  ),
  constraint candidate_attempts_duration_check check (duration_ms >= 0)
);

comment on table public.candidate_attempts is
  'URL 확인·본문 추출·파싱·저장 단계별 성공과 실패 이력.';

create index if not exists article_candidates_queue_idx
  on public.article_candidates (priority desc, next_retry_at, discovered_at)
  where state in ('queued', 'retry_wait', 'processing');
create index if not exists article_candidates_canonical_idx
  on public.article_candidates (canonical_url);
create index if not exists article_candidates_provider_idx
  on public.article_candidates (first_provider, discovered_at desc);
create index if not exists candidate_discoveries_candidate_idx
  on public.candidate_discoveries (candidate_id, discovered_at);
create index if not exists candidate_discoveries_provider_idx
  on public.candidate_discoveries (provider, discovered_at desc);
create index if not exists candidate_attempts_candidate_idx
  on public.candidate_attempts (candidate_id, created_at desc);

drop trigger if exists article_candidates_set_updated_at on public.article_candidates;
create trigger article_candidates_set_updated_at
  before update on public.article_candidates
  for each row execute function public.set_updated_at();

create or replace function public.claim_article_candidates(
  p_limit integer default 30,
  p_lease_seconds integer default 300
)
returns setof public.article_candidates
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select candidate.id
    from public.article_candidates candidate
    where (
      candidate.state in ('queued', 'retry_wait')
      and candidate.next_retry_at <= now()
    ) or (
      candidate.state = 'processing'
      and candidate.locked_until < now()
    )
    order by candidate.priority desc, candidate.next_retry_at, candidate.discovered_at
    limit greatest(least(p_limit, 100), 1)
    for update skip locked
  )
  update public.article_candidates candidate
  set state = 'processing',
      stage = case
        when candidate.stage = 'discovered' then 'content_pending'
        else candidate.stage
      end,
      locked_until = now() + make_interval(secs => greatest(least(p_lease_seconds, 900), 30)),
      attempt_count = candidate.attempt_count + 1,
      updated_at = now()
  from claimable
  where candidate.id = claimable.id
  returning candidate.*;
end;
$$;

revoke all on function public.claim_article_candidates(integer, integer) from public;
revoke all on function public.claim_article_candidates(integer, integer) from anon;
revoke all on function public.claim_article_candidates(integer, integer) from authenticated;
grant execute on function public.claim_article_candidates(integer, integer) to service_role;

alter table public.article_candidates enable row level security;
alter table public.candidate_discoveries enable row level security;
alter table public.candidate_attempts enable row level security;

drop policy if exists "article_candidates: admin 조회" on public.article_candidates;
create policy "article_candidates: admin 조회"
  on public.article_candidates for select
  to authenticated
  using (public.is_admin());

drop policy if exists "candidate_discoveries: admin 조회" on public.candidate_discoveries;
create policy "candidate_discoveries: admin 조회"
  on public.candidate_discoveries for select
  to authenticated
  using (public.is_admin());

drop policy if exists "candidate_attempts: admin 조회" on public.candidate_attempts;
create policy "candidate_attempts: admin 조회"
  on public.candidate_attempts for select
  to authenticated
  using (public.is_admin());

grant select on public.article_candidates to authenticated;
grant select on public.candidate_discoveries to authenticated;
grant select on public.candidate_attempts to authenticated;
grant all on public.article_candidates to service_role;
grant all on public.candidate_discoveries to service_role;
grant all on public.candidate_attempts to service_role;
