-- 336 🔴 보안 — authenticated 의 public.users 쓰기 권한 회수
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
--
-- ⛔⛔ **순서가 있습니다. 지금 돌리면 안 됩니다.**
--
--   1. 지시서 335 코드가 **배포되고**
--   2. David 가 **온보딩·마이페이지 저장이 되는 것을 화면에서 확인**한 뒤
--   3. 그때 이 SQL 을 적용합니다.
--
--   순서를 뒤집으면 온보딩과 마이페이지 저장이 **즉시 죽습니다.**
--   (지금은 브라우저가 anon 키로 users 를 직접 UPDATE 하고 있습니다)
--
--   → **David 가 "335 배포 확인됐다" 고 할 때까지 실행하지 마세요.**


-- ═══════════════════════════════════════════════════════════════════════════
-- 배경
-- ═══════════════════════════════════════════════════════════════════════════
--
--   334 는 트리거로 role 변경을 **되돌리는** 임시 방어였습니다.
--   이 SQL 은 애초에 **쓸 수 없게** 만듭니다.
--
--   335 코드 배포 후에는 users 쓰기가 전부 service_role 서버 경로로 갑니다.
--   service_role 은 RLS 를 우회하므로 아래 정책을 지워도 정상 동작합니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 0] 사전 확인 — 335 가 배포됐는지
-- ═══════════════════════════════════════════════════════════════════════════
--
--   David 가 아래를 확인했어야 합니다:
--     · /onboarding 에서 이름·팀 입력 → 완료 → /dashboard 진입 OK
--     · /dashboard/mypage 에서 기본 정보 저장 OK
--     · /dashboard/mypage 에서 기본 보기 변경 → 콘텐츠 화면 반영 OK
--
--   ⛔ 하나라도 확인 안 됐으면 **중단하고 David 에게 물어보세요.**


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 1] 현재 정책 확인 (읽기 전용)
-- ═══════════════════════════════════════════════════════════════════════════

select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'users'
 order by cmd, policyname;

--   기대되는 현재 상태:
--     users: 본인 조회      SELECT   ← **유지한다**
--     users: admin 전체 조회 SELECT   ← **유지한다**
--     users: 본인 추가      INSERT   ← 회수 대상
--     users: 본인 수정      UPDATE   ← 회수 대상


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 2] 회수 — 335 배포 확인 후에만
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── UPDATE 회수 ──────────────────────────────────────────────────────────
-- 사용자가 자기 행을 직접 고칠 수 없게 한다.
-- 이름·팀·렌즈 등의 변경은 335 의 서버 액션(service_role)이 대신 쓴다.
drop policy if exists "users: 본인 수정" on public.users;

-- ── INSERT 회수 ──────────────────────────────────────────────────────────
-- public.users 행은 DB 트리거 handle_new_user() 가 만든다(security definer).
-- 앱에서 users 를 INSERT 할 일이 없다.
-- ⚠️ 335 §3-3 의 확인 결과(앱에 users INSERT 코드가 0건)를 David 가 확인한 뒤 실행.
drop policy if exists "users: 본인 추가" on public.users;

-- ⛔ SELECT 정책은 건드리지 않는다 — 지우면 화면 전체가 죽는다.
--    "users: 본인 조회" · "users: admin 전체 조회" 는 그대로 둔다.

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 3] 검증
-- ═══════════════════════════════════════════════════════════════════════════

-- ① 정책이 SELECT 2개만 남았는가
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'users'
 order by cmd, policyname;
--   → SELECT 2개만 남아야 정상. UPDATE/INSERT 정책이 있으면 안 됨.

-- ② RLS 는 여전히 켜져 있는가 (끄면 안 된다)
select relrowsecurity
  from pg_class
 where oid = 'public.users'::regclass;
--   → true 여야 정상

-- ③ 334 트리거는 그대로 두는가 — **그렇다. 이중 방어로 남긴다.**
select case when prosrc like '%new.role%' then '✅ role 보호 트리거 살아있음'
            else '⚠️ 334 가 아직 적용 안 됨' end
  from pg_proc where proname = 'lock_approval_columns';


-- ═══════════════════════════════════════════════════════════════════════════
-- [롤백] 문제가 생기면 — 정책을 되살린다
-- ═══════════════════════════════════════════════════════════════════════════
--
-- begin;
--
-- create policy "users: 본인 수정"
--   on public.users for update
--   using (auth.uid() = id) with check (auth.uid() = id);
--
-- create policy "users: 본인 추가"
--   on public.users for insert
--   with check (auth.uid() = id);
--
-- commit;
--
--   ※ 되살려도 334 트리거가 role 을 보호하므로 자기승격은 계속 막힙니다.
