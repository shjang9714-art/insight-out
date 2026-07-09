-- 239 로그인 도메인 게이팅 + 자동 승인
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 붙여넣고 RUN(한 번에).
-- 목적: (A) 신규 가입을 회사 이메일 @lguplus.co.kr(+예외 allowlist)로 제한(Before User Created Hook),
--       (B) 도메인 검증된 신규 사용자는 자동 승인(approval_status='approved') → /pending 병목 제거.
-- 근거: 회사 이메일이 Google이 아님 → 회사 이메일 OTP로 임직원 인증(지시서 239). 도메인=임직원 증명.
-- ⚠ 이 SQL 적용 후, David가 대시보드에서 Hook 등록 + 이메일 템플릿 {{ .Token }} 설정해야 실동작(하단 참고).

begin;

-- ── A-1. 예외 allowlist (도메인 밖 허용할 개별 이메일: admin 등) ──────────────
create table if not exists public.signup_email_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

insert into public.signup_email_allowlist (email, note) values
  ('yjhead@gmail.com',       'admin(David) 예외 — 개인 Gmail'),
  ('sh.jang9714@gmail.com',  'admin 예외')
on conflict (email) do nothing;

-- ── A-2. Before User Created Hook 함수 ───────────────────────────────────────
-- event->'user'->>'email' 로 신규 가입 이메일 검사(공식 페이로드).
-- 허용: @lguplus.co.kr 도메인  OR  allowlist 등재.  그 외: 403 거부.
create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_email  text := lower(event->'user'->>'email');
  v_domain text := split_part(lower(event->'user'->>'email'), '@', 2);
begin
  if v_domain = 'lguplus.co.kr'
     or exists (
       select 1 from public.signup_email_allowlist a
       where lower(a.email) = v_email
     )
  then
    return '{}'::jsonb;              -- 허용
  end if;

  return jsonb_build_object(         -- 거부(클라이언트에 메시지 전파)
    'error', jsonb_build_object(
      'http_code', 403,
      'message', '사내 이메일(@lguplus.co.kr) 계정만 가입할 수 있습니다.'
    )
  );
end;
$$;

-- ── A-3. 권한 (Auth 훅은 supabase_auth_admin 롤로 실행) ───────────────────────
grant execute on function public.hook_restrict_signup_by_email_domain(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_by_email_domain(jsonb)
  from authenticated, anon, public;
-- allowlist 테이블도 훅 롤이 읽어야 함
grant select on public.signup_email_allowlist to supabase_auth_admin;

-- ── B. 자동 승인 — handle_new_user 수정 ──────────────────────────────────────
-- 도메인 Hook이 이미 임직원을 검증하므로, 신규 users 행을 곧바로 approved 로 생성.
-- (기존 사용자는 이미 approved — 2026-06-18 approval SQL에서 백필됨. 영향 없음.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, approval_status, approved_at)
  values (new.id, coalesce(new.email, ''), 'approved', now())
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;

-- ============================================================
-- 검증 (같은 배치에서)
-- ============================================================
-- 함수 존재·권한
select proname from pg_proc where proname = 'hook_restrict_signup_by_email_domain';
select email, note from public.signup_email_allowlist order by email;
-- handle_new_user 가 approved 로 삽입하는지(정의 확인)
select pg_get_functiondef('public.handle_new_user'::regproc);

-- ============================================================
-- ⚠ SQL 만으로는 훅이 켜지지 않음 — David 가 대시보드에서 마무리:
--   1) Auth → Hooks → "Before user created" → Postgres function
--        → public.hook_restrict_signup_by_email_domain 선택 → Enable.
--   2) Auth → Email Templates → Magic Link 템플릿 본문에 {{ .Token }} 포함
--        (6자리 코드가 메일에 표시되도록. 링크만 있으면 코드 안 보임).
--   3) (선택) Google provider 비활성(미사용).
-- 롤백: 훅 비활성 + handle_new_user 를 approval_status 미지정(기본 'pending')으로 되돌리면 됨.
-- ============================================================
