-- ============================================================
-- 지시서 65 — content_signals (시그널 토대) + signal_type enum + signal_hint 시드
-- 수희 실행: Supabase Dashboard → SQL Editor 에서 1회 실행
-- ⚠️ signal_type 은 enum(추후 값 추가는 가능하나 삭제 어려움) — David 목록 확정 후 실행할 것.
-- ============================================================

-- 1) signal_type enum (시장 인텔리전스 시그널 8종 — 한국어 값)
create type signal_type as enum (
  '경쟁사동향',
  '규제·정부',
  '신제품·출시',
  '투자·M&A',
  '기술트렌드',
  '시장지표',
  '파트너십',
  '인사·조직'
);

-- 2) content_signals (콘텐츠 × 시그널, rule 또는 llm 출처)
create table public.content_signals (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references public.contents (id) on delete cascade,
  signal_type signal_type not null,
  score       numeric not null default 1.0,
  source      text not null default 'rule',   -- 'rule'(keyword_groups.signal_hint) | 'llm'(후속)
  created_at  timestamptz not null default now(),
  unique (content_id, signal_type)            -- 동일 콘텐츠×시그널 중복 방지(멱등)
);
create index content_signals_content_idx on public.content_signals (content_id);
create index content_signals_type_idx    on public.content_signals (signal_type);

-- 3) RLS (인증 조회 + admin 전체; 크롤러는 service_role 로 RLS 우회 적재)
alter table public.content_signals enable row level security;
create policy "content_signals: 인증 조회"
  on public.content_signals for select using (auth.uid() is not null);
create policy "content_signals: admin 전체"
  on public.content_signals for all using (public.is_admin()) with check (public.is_admin());

-- 4) keyword_groups.signal_hint 시드 (rule 기반 시그널 매핑 — 운영하며 어드민에서 조정)
--    그룹 매칭 시 해당 signal_hint 가 content_signals 로 적재된다.
update public.keyword_groups set signal_hint = '경쟁사동향'
  where kind in ('competitor');
update public.keyword_groups set signal_hint = '규제·정부'
  where kind in ('gov_reg', 'gov_business');
update public.keyword_groups set signal_hint = '기술트렌드'
  where kind in ('ai_tech', 'aicc', 'aidc', 'physical_ai', 'manufacturing_dx');
-- (신제품·출시 / 투자·M&A / 파트너십 / 인사·조직 등 이벤트형 시그널은 그룹 멤버십으로 판정 불가
--  → LLM 시그널(후속 슬라이스)에서 부여. rule 단계에선 위 3종만 시드.)

-- 5) 검증
select unnest(enum_range(null::signal_type)) as signal_types;
select kind, signal_hint from public.keyword_groups where signal_hint is not null order by kind;
