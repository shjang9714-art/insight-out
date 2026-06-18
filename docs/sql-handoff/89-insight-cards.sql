-- 지시서 89 — insight_cards (AI 핵심 인사이트 카드) 스키마
-- 담당: 수희(Supabase SQL Editor에서 실행). 코드 배포 전 선적용.
-- 멱등 작성(재실행 안전). set_updated_at()·is_admin() 는 기존 정의 전제.

-- 1) 상태 enum
do $$ begin
  create type insight_card_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

-- 2) 테이블
create table if not exists public.insight_cards (
  id                 uuid primary key default gen_random_uuid(),
  period_start       date not null,
  period_end         date not null,
  scope              text not null default 'industry',   -- 'industry' | (후속) 'company'
  topic              text not null,                       -- 주제/그룹명 (matched_group 등)
  headline           text not null,                       -- 핵심 인사이트 한 줄
  implication        text,                                -- LGU+ B2B 시사점
  source_content_ids uuid[] not null default '{}',        -- 근거 콘텐츠
  citations          jsonb  not null default '[]',        -- [{content_id, quote}]
  status             insight_card_status not null default 'draft',
  generated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3) 멱등·조회 인덱스
create unique index if not exists insight_cards_period_scope_topic_key
  on public.insight_cards (period_start, scope, topic);
create index if not exists insight_cards_status_idx
  on public.insight_cards (status, period_start desc);

-- 4) updated_at 트리거
drop trigger if exists set_insight_cards_updated_at on public.insight_cards;
create trigger set_insight_cards_updated_at
  before update on public.insight_cards
  for each row execute function public.set_updated_at();

-- 5) RLS
alter table public.insight_cards enable row level security;

drop policy if exists "insight_cards: 인증 사용자 published 조회" on public.insight_cards;
create policy "insight_cards: 인증 사용자 published 조회"
  on public.insight_cards for select
  using (auth.role() = 'authenticated' and status in ('published','archived'));

drop policy if exists "insight_cards: admin 관리" on public.insight_cards;
create policy "insight_cards: admin 관리"
  on public.insight_cards for all
  using (public.is_admin()) with check (public.is_admin());
