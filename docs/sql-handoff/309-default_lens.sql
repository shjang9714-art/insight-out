-- 309 기본 렌즈(default_lens) — content_filter_mode 미구현 완성
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN. 멱등.
--
-- 배경:
--   users.content_filter_mode ('my_services' | 'all') 는 온보딩·마이페이지에서 저장만 되고
--   **아무 데서도 읽지 않는다.** 사용자가 "담당 서비스만"을 골라도 아무 일도 일어나지 않는다.
--
--   한편 코드의 lens 체계(mine | watch | all)는 **localStorage 에만** 저장되어
--   기기를 바꾸면 초기화되고, 온보딩에서 고른 값이 반영되지 않는다.
--
--   → 둘을 합친다. default_lens 를 lens 의 DB 기본값으로 삼는다.
--
-- 주의:
--   * content_filter_mode 컬럼은 **지우지 않는다**(롤백 여지). 폐기는 지시서 306(오픈 후).
--   * 앱은 default_lens 가 없어도(42703) 'all' 로 graceful 폴백하도록 구현된다.
--     → 이 SQL 을 먼저 돌려도, 나중에 돌려도 앱이 깨지지 않는다.

begin;

-- ── 1. default_lens 컬럼 추가 ────────────────────────────────────────────────
alter table public.users
  add column if not exists default_lens text not null default 'all';

-- CHECK 제약 (중복 생성 방지)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_default_lens_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_default_lens_check
      check (default_lens in ('mine', 'watch', 'all'));
  end if;
end $$;

-- ── 2. 기존 content_filter_mode 값 백필 ─────────────────────────────────────
-- 'my_services' → 'mine' / 'all' → 'all' / NULL → 'all'(기본값)
-- 이미 default_lens 를 손댄 사용자는 건드리지 않는다(= 아직 'all' 기본값인 행만).
update public.users
   set default_lens = case content_filter_mode
                        when 'my_services' then 'mine'
                        else 'all'
                      end
 where default_lens = 'all'                  -- 기본값 그대로인 행만
   and content_filter_mode is not null;

commit;

-- ── 확인용 ───────────────────────────────────────────────────────────────────
-- 컬럼·제약이 생겼는지:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'users' and column_name = 'default_lens';
--
-- 값 분포 (기존 content_filter_mode 와 대조):
--   select content_filter_mode, default_lens, count(*)
--     from public.users
--    group by 1, 2
--    order by 1, 2;
--   → content_filter_mode = 'my_services' 인 행이 default_lens = 'mine' 이어야 정상.
