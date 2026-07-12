-- 190: MCP 팀원별 토큰 + 감사로그
--
-- 배경: 188 MCP(/api/mcp)는 팀 공용 단일 MCP_TOKEN 하나로만 인증했다.
--       그 결과 "누가 썼는지"를 알 수 없어 ai_reports.user_id(NOT NULL FK) 같은
--       작성자 필수 테이블에 쓸 수 없었다.
--       190은 팀원 1인 1토큰 체계로 바꿔, 각자의 Claude(Code/Desktop)가
--       자기 계정으로 인사이트 아웃에 기록하도록 한다.
--
-- 적용: Supabase SQL Editor 에서 이 파일 전체 실행. 멱등(재실행 안전).

-- ============================================================
-- 1. mcp_tokens — 팀원별 발급 토큰
-- ============================================================
-- 평문 토큰은 저장하지 않는다. 발급 시점에 1회만 화면에 노출하고
-- DB 에는 sha256 해시만 남긴다(유출 시에도 원문 복원 불가).
create table if not exists public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  label        text not null default '',              -- 용도 메모(예: 'David - MacBook Claude Code')
  token_hash   text not null unique,                  -- sha256(평문 토큰) hex
  token_prefix text not null default '',              -- 앞 8자(io_xxxxxxxx) — 목록에서 식별용
  scopes       text[] not null default '{read,ops}',  -- read | ops | reports | publish
  last_used_at timestamptz,
  expires_at   timestamptz,                           -- null = 무기한
  revoked_at   timestamptz,                           -- null = 유효
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_mcp_tokens_user   on public.mcp_tokens (user_id);
create index if not exists idx_mcp_tokens_active on public.mcp_tokens (token_hash) where revoked_at is null;

comment on table  public.mcp_tokens          is '190: MCP 팀원별 액세스 토큰. 평문 미저장(sha256 해시만).';
comment on column public.mcp_tokens.scopes   is 'read=조회 · ops=작업기록 · reports=전략보고서 · insights=핵심인사이트 · publish=즉시 발행 허용(없으면 초안까지만)';

-- RLS: service_role 로만 접근(앱 서버 경유). 클라이언트 직접 접근 차단.
alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from anon, authenticated;

-- ============================================================
-- 2. mcp_audit_log — MCP 쓰기 감사 추적
-- ============================================================
-- MCP 는 service_role 로 DB 에 쓰므로 RLS 가 우회된다.
-- 누가·어떤 툴로·무엇을 바꿨는지 남기지 않으면 사고 시 추적이 불가능하다.
create table if not exists public.mcp_audit_log (
  id          bigserial primary key,
  user_id     uuid references public.users (id) on delete set null,
  token_id    uuid references public.mcp_tokens (id) on delete set null,
  tool        text not null,                          -- 호출된 툴 이름
  target_table text,                                  -- 영향받은 테이블
  target_id   text,                                   -- 영향받은 행 id
  args        jsonb,                                  -- 호출 인자(민감정보 없음 가정)
  ok          boolean not null default true,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mcp_audit_created on public.mcp_audit_log (created_at desc);
create index if not exists idx_mcp_audit_user    on public.mcp_audit_log (user_id, created_at desc);

comment on table public.mcp_audit_log is '190: MCP 쓰기 툴 호출 감사 로그. 읽기 툴은 기록하지 않음.';

alter table public.mcp_audit_log enable row level security;
revoke all on public.mcp_audit_log from anon, authenticated;

-- ============================================================
-- 3. ops_requests — work(작업) 컬럼 보강 (189 대응)
-- ============================================================
-- 189 에서 work 항목의 phase/seq 를 쓰기로 했으나 컬럼이 없는 환경이 있다.
-- MCP 가 작업계획을 기록하려면 필수. 멱등하게 추가.
alter table public.ops_requests add column if not exists phase text;
alter table public.ops_requests add column if not exists seq   integer;

create index if not exists idx_ops_requests_work
  on public.ops_requests (post_type, phase, seq) where post_type = 'work';

-- ============================================================
-- 4. 검증
-- ============================================================
-- 실행 후 아래가 모두 t 여야 정상:
select
  to_regclass('public.mcp_tokens')     is not null as mcp_tokens_ok,
  to_regclass('public.mcp_audit_log')  is not null as mcp_audit_log_ok,
  exists (select 1 from information_schema.columns
          where table_name = 'ops_requests' and column_name = 'phase') as ops_phase_ok,
  exists (select 1 from information_schema.columns
          where table_name = 'ops_requests' and column_name = 'seq')   as ops_seq_ok;
