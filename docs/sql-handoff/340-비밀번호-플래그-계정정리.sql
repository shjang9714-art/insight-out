-- 340 🔴 비밀번호 로그인 전환 (1/2) — has_password 플래그 + 기존 계정 정리
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
--
-- 선행: 334 · 336 · 339
-- 동반: **지시서 341**(로그인 화면 전환). ⛔ 아래 [순서] 를 반드시 지킬 것.
--
-- 근거: David 결정(2026-07-13)
--   · @lguplus.co.kr → OTP 이메일 인증 → **비밀번호 설정** → 이후 **비밀번호 로그인**
--   · 로그인 실패 시 "비번 틀림 / 미설정"을 구분해 알리지 않는다(계정 존재 유출 방지)
--     → 단일 경로: **[이메일로 코드 받기] → OTP → 비밀번호 설정**
--   · 기존 9명 중 **어드민 3명만 남기고 6명 삭제**


-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ 순서 — 뒤집으면 아무도 로그인 못 한다
-- ═══════════════════════════════════════════════════════════════════════════
--
--   [STEP 1] 이 파일의 has_password 컬럼 + 트리거   ← 지금 실행 OK (앱과 무관, 안전)
--   [STEP 2] 지시서 341 코드 배포 (비밀번호 로그인 화면)
--   [STEP 3] David 가 화면에서 가입·로그인·비번설정 확인
--   [STEP 4] 그 다음에 [STEP 4] 계정 정리(삭제) 실행     ← 되돌릴 수 없음
--
--   ⚠️ STEP 1 은 **컬럼 추가일 뿐** 앱 동작을 바꾸지 않는다. 지금 돌려도 안전하다.
--   ⚠️ STEP 4 는 **되돌릴 수 없다.** David 확인 전엔 절대 실행 금지.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 1] has_password 플래그 — 앱이 "비번 설정 여부"를 알 수 있게 한다
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 왜 필요한가:
--   Supabase 의 auth.users.encrypted_password 는 **앱에서 읽을 수 없다**(auth 스키마).
--   그래서 "이 사람이 비번을 설정했는가"를 판별할 수단이 지금 **0개**다.
--   → auth.users 에 트리거를 걸어 public.users.has_password 로 **미러링**한다.

begin;

alter table public.users
  add column if not exists has_password boolean not null default false;

comment on column public.users.has_password is
  '340 — auth.users.encrypted_password 미러. 트리거가 유지한다. 앱에서 직접 쓰지 말 것.';

-- 미러링 트리거 (INSERT · UPDATE 둘 다)
create or replace function public.sync_has_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set has_password = (new.encrypted_password is not null
                         and length(new.encrypted_password) > 0)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_has_password on auth.users;
create trigger trg_sync_has_password
  after insert or update of encrypted_password on auth.users
  for each row execute function public.sync_has_password();

-- 현재 값 백필 (기존 사용자 — 전원 false 가 나와야 정상)
update public.users u
   set has_password = (a.encrypted_password is not null
                       and length(a.encrypted_password) > 0)
  from auth.users a
 where a.id = u.id;

commit;


-- ── STEP 1 검증 ─────────────────────────────────────────────────────────────
select email, role, has_password
  from public.users
 order by has_password desc, created_at;
--   → 지금은 **전원 has_password = false** 여야 정상이다(아무도 비번이 없다).

select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'auth.users'::regclass
   and tgname in ('on_auth_user_created', 'trg_sync_has_password')
 order by tgname;
--   → 2행, tgenabled = 'O' 여야 정상.

-- ⛔ 336 이 users UPDATE 를 회수했는데 이 트리거가 UPDATE 를 하는 게 괜찮은가?
--    → 괜찮다. security definer 함수는 **정의자(postgres) 권한**으로 돌고,
--      RLS 정책은 authenticated/anon 에만 걸려 있다. 트리거는 영향받지 않는다.
--    → 아래로 확인:
select rolname from pg_roles
 where oid = (select proowner from pg_proc where proname = 'sync_has_password');
--   → postgres (또는 supabase_admin) 이어야 정상.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 2·3] — SQL 아님. 341 코드 배포 + David 화면 확인
-- ═══════════════════════════════════════════════════════════════════════════
--
--   David 가 확인할 것:
--     · 신규 계정: 이메일 → OTP → 비밀번호 설정 → /dashboard
--     · 재로그인:  이메일 + 비밀번호 → /dashboard
--     · 비번 잊음: [이메일로 코드 받기] → OTP → 새 비밀번호 → /login
--
--   ⛔ 셋 다 확인되기 전엔 STEP 4 를 실행하지 마세요.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 4] ⛔⛔ 계정 정리 — 되돌릴 수 없다. David 확인 후에만.
-- ═══════════════════════════════════════════════════════════════════════════
--
--   David 결정: **어드민 3명만 남기고 나머지 6명 삭제.**
--
--   ⚠️ auth.users 를 지우면 public.users 가 cascade 로 지워지고,
--      그에 딸린 bookmarks · archives · user_services · user_watchlist ·
--      newsletter_subscriptions 도 함께 사라집니다.
--
--   아래 주석(--)을 풀고 실행하세요.


-- ── ① 먼저 지울 대상을 눈으로 확인 (읽기 전용) ─────────────────────────────
select id, email, name, role, approval_status, created_at
  from public.users
 where role <> 'admin'
 order by created_at;

--   기대(6명): jangsuhui@lguplus.co.kr · yongjukim@lguplus.co.kr ·
--             test@lguplus.co.kr · trq3215@gmail.com ·
--             heeday24@gmail.com · suhuipyogwang@gmail.com
--
--   ⭐ **남길 3명이 여기 없어야 한다:**
--      yjhead@gmail.com · sh.jang9714@gmail.com · yjhead@naver.com
--   ⛔ 남길 계정이 목록에 있으면 **중단하고 David 에게 알리세요.**


-- ── ② 딸려 사라질 데이터 건수 (읽기 전용) ───────────────────────────────────
select 'bookmarks' as 테이블, count(*) from public.bookmarks
 where user_id in (select id from public.users where role <> 'admin')
union all select 'archives', count(*) from public.archives
 where user_id in (select id from public.users where role <> 'admin')
union all select 'user_watchlist', count(*) from public.user_watchlist
 where user_id in (select id from public.users where role <> 'admin')
union all select 'user_services', count(*) from public.user_services
 where user_id in (select id from public.users where role <> 'admin');

--   → 이 건수가 사라집니다. David 에게 보고 후 진행.


-- ── ③ 실제 삭제 (주석 해제 후 실행) ─────────────────────────────────────────
--
-- begin;
--
-- delete from auth.users
--  where id in (select id from public.users where role <> 'admin');
--
-- commit;
--
--   ※ auth.users 삭제 → public.users 가 on delete cascade 로 함께 삭제됩니다.
--   ※ public.users 를 먼저 지우면 auth.users 에 고아 계정이 남습니다. **순서 중요.**


-- ── ④ 삭제 후 확인 ──────────────────────────────────────────────────────────
-- select email, role, has_password from public.users order by created_at;
--   → 3행(어드민)만 남아야 정상.
--
-- select count(*) as auth_계정수 from auth.users;
--   → 3 이어야 정상. 더 많으면 고아 계정이 있습니다.
