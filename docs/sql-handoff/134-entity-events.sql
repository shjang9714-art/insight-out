-- 134: 기업 사건 타임라인 캐시. 멱등(재생성 시 entity 단위 delete→insert).
create table if not exists public.entity_events (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references public.entities(id) on delete cascade,
  event_date         date not null,
  signal_type        text,                         -- content_signals enum 중 하나(없으면 null)
  headline           text not null,                -- "사건 한 줄"
  detail             text,                          -- 1~2문장(선택)
  sentiment          text check (sentiment in ('긍정','중립','부정')),
  source_content_ids uuid[] not null default '{}',
  citations          jsonb not null default '[]',
  model              text,
  generated_at       timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists entity_events_entity_date_idx
  on public.entity_events (entity_id, event_date desc);

alter table public.entity_events enable row level security;
drop policy if exists "entity_events: 인증 조회" on public.entity_events;
create policy "entity_events: 인증 조회" on public.entity_events
  for select to authenticated using (true);
drop policy if exists "entity_events: admin 관리" on public.entity_events;
create policy "entity_events: admin 관리" on public.entity_events
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
