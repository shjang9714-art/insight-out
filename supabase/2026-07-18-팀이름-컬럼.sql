-- 온보딩/마이페이지 '팀 이름' 자유 입력 복구용 컬럼
-- users.team 은 '그룹'(ORG_GROUPS)을 저장하므로, 팀 이름은 별도 컬럼에 저장한다.
-- 기존 users 테이블 GRANT가 새 컬럼에도 그대로 적용되므로 별도 GRANT 불필요.
alter table public.users
  add column if not exists team_name text not null default '';
