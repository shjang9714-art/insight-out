-- 지시서 B (2026-07-14) — 키워드 상세 LLM 핵심 인사이트 캐시
-- 실행 위치: Supabase SQL Editor (수희) — 이 파일은 코드 배포와 별개로 수동 실행 필요.

create table if not exists public.keyword_insight_cache (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.entities(id) on delete cascade,
  insight_text  text not null,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_keyword_insight_cache_entity
  on public.keyword_insight_cache(entity_id);

alter table public.keyword_insight_cache enable row level security;

drop policy if exists "keyword_insight_cache: 인증 사용자 조회" on public.keyword_insight_cache;
create policy "keyword_insight_cache: 인증 사용자 조회"
  on public.keyword_insight_cache for select
  using (auth.role() = 'authenticated');

drop policy if exists "keyword_insight_cache: admin 관리" on public.keyword_insight_cache;
create policy "keyword_insight_cache: admin 관리"
  on public.keyword_insight_cache for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.keyword_insight_cache to anon, authenticated;
grant select, insert, update on public.keyword_insight_cache to service_role;
