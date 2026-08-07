-- 493-A: user_role enum 확장 (super_admin / viewer)
-- 적용: David 직접 (Supabase SQL Editor). 한 줄씩 그대로 실행. 멱등.
--
-- ⚠️ alter type ... add value 는 트랜잭션 안에서 실행할 수 없다.
--    begin/commit 으로 감싸지 말 것. 아래 두 줄을 그대로 붙여넣고 RUN.

alter type public.user_role add value if not exists 'super_admin';
alter type public.user_role add value if not exists 'viewer';

-- 확인
-- select unnest(enum_range(null::public.user_role)) as role;
--   → user, admin, super_admin, viewer
--
-- 기존 admin 5명은 그대로 admin 으로 남는다.
-- super_admin 지정은 아래를 David 가 직접 실행한다(이메일을 본인 것으로 교체):
--
--   update public.users set role = 'super_admin' where email = 'yjhead@gmail.com';
--
-- ⚠️ super_admin 을 최소 1명 지정한 뒤에 493 코드를 배포할 것.
--    안 그러면 데이터 초기화·권한 변경·설정 저장을 아무도 못 하게 된다.
