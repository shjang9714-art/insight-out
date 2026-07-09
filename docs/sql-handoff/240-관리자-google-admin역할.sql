-- 240 관리자 Google 로그인 — allowlist admin 플래그 + 역할 자동부여
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- ⚠ 순서: 239 SQL(allowlist·Hook·자동승인) 적용 후 이 240을 적용(240의 handle_new_user가 최종판, 239판을 대체).
-- 목적: (A) 예외 allowlist 에 is_admin 플래그 추가 → 관리자 gmail 구분,
--       (B) handle_new_user 를 최종판으로 — 신규 계정 자동 승인 + allowlist(is_admin)면 role='admin' 자동부여.
-- 배경: 관리자 gmail 은 239 allowlist 에 이미 등재 → 도메인 Hook 통과 → Google 로 직접 로그인 가능.
--       일반 직원 gmail 은 Hook 이 차단하므로 "관리자 외 Google 가입 불가"가 자동 강제됨.

begin;

-- ── A. allowlist 에 admin 플래그 ─────────────────────────────────────────────
alter table public.signup_email_allowlist
  add column if not exists is_admin boolean not null default false;

update public.signup_email_allowlist
set is_admin = true
where email in ('yjhead@gmail.com', 'sh.jang9714@gmail.com');

-- ── B. handle_new_user 최종판 (자동승인 + admin 역할 자동부여) ────────────────
-- 신규 auth.users 삽입 시 트리거. 도메인 Hook 을 이미 통과한 계정만 여기 도달.
-- allowlist 에 is_admin=true 로 등재된 이메일이면 role='admin', 아니면 'user'. 모두 자동 승인.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_is_admin boolean;
begin
  v_is_admin := coalesce(
    (select a.is_admin
       from public.signup_email_allowlist a
      where lower(a.email) = lower(coalesce(new.email, ''))
      limit 1),
    false
  );

  insert into public.users (id, email, approval_status, approved_at, role)
  values (
    new.id,
    coalesce(new.email, ''),
    'approved',
    now(),
    (case when v_is_admin then 'admin' else 'user' end)::public.user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;

-- ============================================================
-- 검증
-- ============================================================
select email, is_admin, note from public.signup_email_allowlist order by is_admin desc, email;
select pg_get_functiondef('public.handle_new_user'::regproc);
-- 기존 관리자 계정은 이 트리거(신규 생성 전용)와 무관 — 이미 role 보유. 영향 없음.
-- 신규 관리자: 해당 gmail 로 Google 최초 로그인 시 자동으로 role='admin' + approved.
