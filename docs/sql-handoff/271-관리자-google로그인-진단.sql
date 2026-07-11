-- 271 관리자 Google 로그인 실패("auth failed") 진단 (읽기 전용, 안전)
-- 핸드오프: 수희 → Supabase SQL Editor. 전체 RUN 후 결과를 David/Opus 에 공유.
-- 배경: sh.jang9714@gmail.com Google 로그인 시 auth_failed. allowlist 는 정상 등재 → 도메인 Hook 아님.
--       가설: public.users 행 id 와 auth.users id 불일치 → handle_new_user insert 시 email 유니크 충돌
--            → "Database error saving new user" → exchangeCodeForSession 실패 → auth_failed.

-- ── 1. auth.users 상태(두 관리자) ────────────────────────────────────────────
select id as auth_id, email, created_at, last_sign_in_at,
       email_confirmed_at is not null as email_confirmed
from auth.users
where lower(email) in ('yjhead@gmail.com','sh.jang9714@gmail.com')
order by email;

-- ── 2. auth.identities (provider 연결: email vs google) ───────────────────────
select i.user_id, u.email, i.provider, i.created_at
from auth.identities i
join auth.users u on u.id = i.user_id
where lower(u.email) in ('yjhead@gmail.com','sh.jang9714@gmail.com')
order by u.email, i.provider;

-- ── 3. public.users 행(두 관리자) ────────────────────────────────────────────
select id as public_id, email, role, approval_status, created_at
from public.users
where lower(email) in ('yjhead@gmail.com','sh.jang9714@gmail.com')
order by email;

-- ── 4. id 정합성: auth.users.id 와 public.users.id 가 같은가? ────────────────
select coalesce(a.email, p.email) as email,
       a.id as auth_id, p.id as public_id,
       case
         when a.id is null then 'auth.users 없음(로그인 이력 없음)'
         when p.id is null then 'public.users 없음'
         when a.id = p.id  then 'OK (일치)'
         else '⚠ 불일치 — email 유니크 충돌 원인 유력'
       end as diagnosis
from (select * from auth.users where lower(email) in ('yjhead@gmail.com','sh.jang9714@gmail.com')) a
full outer join
     (select * from public.users where lower(email) in ('yjhead@gmail.com','sh.jang9714@gmail.com')) p
  on lower(a.email) = lower(p.email);

-- ── 5. public.users 제약(email 유니크 여부 확인) ─────────────────────────────
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.users'::regclass
order by contype;

-- 해석:
--  · 4번에서 sh.jang 이 "불일치"거나 "auth.users 없음/public.users 있음"이면 → 트리거 insert 시
--    email 충돌 → auth_failed. 조치: 아래 272 로 정합(별도 지시).
--  · sh.jang 이 auth.users 에 email provider 만 있고 google 없음(2번) + 로그인 실패면
--    → identity linking 문제. 조치도 272 에서 안내.
--  · Authentication → Logs(Auth) 에서 실패 시각의 정확한 메시지도 함께 캡처(예:
--    "Database error saving new user" / "duplicate key ... users_email_key")하면 확정.
