-- 334 🔴 보안 — users.role 자기승격 차단
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
--
-- ⚠️ 이건 기능 개선이 아니라 **권한 구멍**입니다. 다른 작업보다 먼저 봐주세요.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 배경 — 무엇이 문제인가
-- ═══════════════════════════════════════════════════════════════════════════
--
--   1) RLS 정책 "users: 본인 수정" (schema.sql:122-125) 은
--      본인 행 UPDATE 를 **컬럼 제한 없이** 허용합니다.
--
--        create policy "users: 본인 수정" on public.users for update
--          using (auth.uid() = id) with check (auth.uid() = id);
--
--   2) 자기승격을 막는 트리거 lock_approval_columns() 가 이미 있는데
--      (2026-06-18-가입승인-approval-status.sql:40-52),
--      approval_status / approved_at / approved_by **3개만** 되돌리고
--      **role 은 건드리지 않습니다.**
--
--   3) role 을 보호하는 트리거·정책·GRANT 를 코드 전수 검색 → **0건.**
--
--   → 로그인한 일반 사용자가 브라우저 콘솔에서 anon 키로
--        supabase.from('users').update({ role: 'admin' }).eq('id', <본인 id>)
--     를 실행하면 통과할 것으로 보입니다.
--
--   그리고 role 은 **신뢰의 뿌리**입니다:
--     · middleware.ts:128      /admin/* 접근 판정
--     · admin/users/actions.ts requireAdmin()
--     · RLS is_admin()         DB 레벨 관리자 판정
--   셋 다 같은 users.role 을 봅니다. **하나 뚫리면 전부 뚫립니다.**


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 1] 확인 — 읽기 전용. 결과를 David 에게 알려주세요
-- ═══════════════════════════════════════════════════════════════════════════

-- ① 컬럼 레벨 GRANT 로 이미 막혀 있는가?
--    (막혀 있다면 STEP 2 가 필요 없습니다)
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'users'
   and privilege_type = 'UPDATE'
   and grantee in ('anon', 'authenticated')
 order by grantee, column_name;

--   해석:
--     결과에 column_name = 'role' 이 있다  → 🔴 뚫려 있습니다. STEP 2 실행.
--     'role' 이 없다 (또는 결과 0행)        → ✅ GRANT 로 이미 막혀 있습니다. STEP 2 불필요.
--                                             (그래도 STEP 2 는 무해합니다 — 이중 방어)


-- ② 현재 트리거가 무엇을 되돌리는지 (role 이 빠졌는지 눈으로 확인)
select prosrc
  from pg_proc
 where proname = 'lock_approval_columns';

--   → 본문에 new.role 이 없으면 구멍이 맞습니다.


-- ③ 지금 admin 인 사람이 누구인가 (이미 누가 승격했는지 확인)
select id, email, name, role, approval_status, created_at
  from public.users
 where role = 'admin'
 order by created_at;

--   → **예상 밖의 계정이 admin 이면 즉시 David 에게 알려주세요.**
--     정상 admin: yjhead@gmail.com, sh.jang9714@gmail.com,
--                 그 외 어드민 화면에서 수동 승격한 계정


-- ④ (참고) 신규 가입이 자동 승인되는가 — 도메인 Hook 이 유일한 차단선인지
select prosrc
  from pg_proc
 where proname = 'handle_new_user';

--   → approval_status 를 'approved' 로 넣고 있으면,
--     Supabase 대시보드의 Before-user-created Hook 이 **유일한 차단선**입니다.
--     (Auth → Hooks 에서 켜져 있는지 확인 필요 — SQL 로는 알 수 없습니다)


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 2] 차단 — STEP 1 ① 에 'role' 이 있으면 실행
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ 안전성 확인 완료 (2026-07-13, 코드 전수 조사):
--    role 을 정당하게 UPDATE 하는 코드는 src/app/admin/users/actions.ts 뿐이고,
--    이 파일은 **service_role 키**를 씁니다 (actions.ts:37 SUPABASE_SERVICE_ROLE_KEY).
--    → current_user = 'service_role' 이므로 아래 트리거에서 **면제**됩니다.
--
--    anon/authenticated 로 users 를 쓰는 경로 4곳
--      (onboarding/page.tsx · mypage/page.tsx · api/preferences/* · api/me/seen)
--    은 role 을 **한 번도 쓰지 않습니다** (grep 0회).
--
--    → 이 트리거는 **정상 기능을 하나도 깨지 않습니다.**
--
--  handle_new_user() 는 INSERT 이므로 BEFORE UPDATE 트리거와 무관합니다.
--  (allowlist.is_admin → role='admin' 자동 부여는 그대로 동작합니다)

begin;

create or replace function public.lock_approval_columns()
returns trigger
language plpgsql
as $$
begin
  -- service_role(어드민 서버 액션·백엔드)만 이 컬럼들을 바꿀 수 있다.
  -- anon/authenticated 가 바꾸려 하면 조용히 옛 값으로 되돌린다.
  if current_user <> 'service_role' then
    new.approval_status := old.approval_status;
    new.approved_at     := old.approved_at;
    new.approved_by     := old.approved_by;
    new.role            := old.role;   -- ⭐ 334 — 자기 admin 승격 차단
  end if;
  return new;
end;
$$;

-- 트리거는 이미 붙어 있으므로 재생성 불필요.
-- (trg_lock_approval_columns — before update on public.users, for each row)
-- 혹시 없을 경우를 대비해 멱등하게 보장:
drop trigger if exists trg_lock_approval_columns on public.users;
create trigger trg_lock_approval_columns
  before update on public.users
  for each row execute function public.lock_approval_columns();

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 3] 검증 — STEP 2 실행 후
-- ═══════════════════════════════════════════════════════════════════════════

-- ① 트리거 본문에 new.role 이 들어갔는가
select case when prosrc like '%new.role%' then '✅ role 보호됨'
            else '🔴 아직 안 들어감' end as 결과
  from pg_proc
 where proname = 'lock_approval_columns';

-- ② 트리거가 users 에 붙어 있는가
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.users'::regclass
   and tgname  = 'trg_lock_approval_columns';
--   → tgenabled = 'O' (enabled) 이어야 정상

-- ③ admin 목록이 STEP 1 ③ 과 동일한가 (트리거가 기존 admin 을 깨지 않았는지)
select id, email, role from public.users where role = 'admin' order by created_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- [참고] David 가 브라우저에서 직접 재현 테스트하는 법 (선택)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   ⚠️ **admin 이 아닌 계정**으로 로그인한 뒤, 브라우저 콘솔에서:
--
--     const { data: { user } } = await window.supabase.auth.getUser()
--     await window.supabase.from('users').update({ role: 'admin' }).eq('id', user.id)
--     // 그 다음 users 를 다시 조회해 role 이 바뀌었는지 확인
--
--   STEP 2 **전**  → role 이 'admin' 으로 바뀌면 구멍이 확인된 것
--   STEP 2 **후**  → 에러 없이 통과하지만 role 은 'user' 그대로여야 정상
--                   (트리거가 조용히 되돌린다 — 에러를 내지 않는다)
--
--   ※ 앱이 supabase 클라이언트를 window 에 노출하지 않으면 이 방법은 안 됩니다.
--     그 경우 STEP 1 ① 의 GRANT 확인으로 갈음하세요.
