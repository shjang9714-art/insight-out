-- 187: 운영 요청/핸드오프 보드. 팀 간 SQL·인프라·공유 요청을 어드민에서 추적.
create table if not exists ops_requests (
  id          uuid primary key default gen_random_uuid(),
  post_type   text not null default 'request',       -- request(요청) | announcement(공지) | work(작업/지시서)
  title       text not null,
  body        text,                                  -- 설명/메모(마크다운 허용)
  kind        text not null default 'other',         -- sql | infra | config | question | share | other
  status      text not null default 'pending',       -- pending | in_progress | done | blocked (공지는 active|archived)
  owner       text,                                   -- 담당(예: 수희, David)
  ref         text,                                   -- 지시서 번호 / commit SHA / 링크
  pinned      boolean not null default false,        -- 공지 상단 고정
  created_by  text,                                   -- 작성자(Opus, Sonnet, David 등)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_ops_requests_status  on ops_requests (post_type, status, updated_at desc);
create index if not exists idx_ops_requests_owner   on ops_requests (owner);

-- updated_at 자동 갱신
create or replace function set_ops_requests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.resolved_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_ops_requests_updated_at on ops_requests;
create trigger trg_ops_requests_updated_at
  before update on ops_requests
  for each row execute function set_ops_requests_updated_at();

-- RLS: 어드민만(서비스 역할은 우회). 앱은 admin 클라이언트(service_role)로 접근 가정.
alter table ops_requests enable row level security;
-- (필요 시 admin 사용자 정책 추가 — 현행 어드민 페이지는 service_role 경유이므로 정책 없이도 서버에서 동작)
