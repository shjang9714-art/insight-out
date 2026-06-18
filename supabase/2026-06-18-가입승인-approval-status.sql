-- ============================================================
-- 신규 회원 가입 승인 절차 — approval_status 스키마
-- Insight Out / 2026-06-18 / 설계: Opus
-- 실행: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 RUN (한 번에)
-- 전제: public.users 에 user_role enum('user','admin') + role default 'user' 이미 존재
-- ============================================================

-- 1) enum 타입 (pending / approved / rejected)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

-- 2) 컬럼 추가 (감사 컬럼 포함)
alter table public.users
  add column if not exists approval_status public.approval_status not null default 'pending',
  add column if not exists approved_at     timestamptz,
  add column if not exists approved_by      uuid references public.users(id);

-- 3) 기존 사용자는 모두 승인 처리 (가드 켤 때 기존 직원 락아웃 방지)
update public.users
set approval_status = 'approved',
    approved_at     = coalesce(approved_at, now())
where approval_status = 'pending';

-- 4) 관리자 계정 보장 (승인 + admin)
update public.users
set approval_status = 'approved',
    role            = 'admin',
    approved_at     = coalesce(approved_at, now())
where email = 'sh.jang9714@gmail.com';

-- 5) self-escalation 차단 트리거
--    일반 사용자(authenticated)가 본인 row 를 UPDATE 할 때
--    approval_status / approved_* 를 바꾸려 하면 무시(이전 값 유지).
--    service_role(어드민 서버 액션)만 실제 변경 가능.
--    ※ SECURITY DEFINER 미사용 — current_user 가 '호출자' 역할로 잡혀야 함.
create or replace function public.lock_approval_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    new.approval_status := old.approval_status;
    new.approved_at     := old.approved_at;
    new.approved_by     := old.approved_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_approval_columns on public.users;
create trigger trg_lock_approval_columns
  before update on public.users
  for each row execute function public.lock_approval_columns();

-- 6) GRANT (컬럼은 기존 테이블 권한 상속, enum USAGE 는 PUBLIC 기본 — 규칙상 명시)
grant usage on type public.approval_status to anon, authenticated;

-- 7) 어드민 pending 목록 조회용 인덱스
create index if not exists idx_users_approval_status on public.users (approval_status);

-- ============================================================
-- 검증 (위 실행과 같은 배치에서 결과 확인)
-- ============================================================
-- 상태별 분포 — 기존 사용자 전원 approved, pending 0 이어야 정상
select approval_status, count(*) as cnt
from public.users
group by approval_status
order by 1;

-- 관리자 계정 확인
select email, role, approval_status, approved_at
from public.users
where email = 'sh.jang9714@gmail.com';
