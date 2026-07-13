-- 306 죽은 컬럼 제거 — users.position · users.content_filter_mode
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
--
-- ⛔⛔ 되돌릴 수 없다. 아래 순서를 반드시 지킬 것.
--
--   1. 지시서 306 코드가 **배포되고**, /admin/users 사용자 목록이 정상인 것을 확인한다.
--      (코드보다 SQL 을 먼저 돌리면 admin/users 의 .select('… position …') 가 42703 으로 죽는다)
--   2. 아래 [STEP 1] 확인 쿼리를 먼저 돌려 **결과를 David 에게 보고**한다.
--   3. David 가 "버려도 된다" 고 확인하면, 그때 [STEP 2] 를 실행한다.
--
-- 배경:
--   position(직책)          — 추천·권한·개인화 어디에도 안 쓰인다. 어드민 목록에 표시만 됐다.
--   content_filter_mode     — 309 에서 default_lens 로 승격됐다. 롤백 여지로 남겨뒀던 것.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 1] 확인 — 먼저 이것만 돌리고 결과를 David 에게 보고하세요
-- ═══════════════════════════════════════════════════════════════════════════

select
  count(*)                                                as 전체_사용자,
  count(*) filter (where position is not null
                     and position <> '')                  as 직책_입력됨,
  count(*) filter (where content_filter_mode is not null) as 구_필터모드_있음,
  count(*) filter (where default_lens is not null)        as 신_기본렌즈_있음
from public.users;

-- 마이그레이션이 제대로 됐는지 (content_filter_mode → default_lens):
select content_filter_mode, default_lens, count(*)
  from public.users
 group by 1, 2
 order by 1, 2;
--   → content_filter_mode = 'my_services' 인 행이 default_lens = 'mine' 이어야 정상.
--     안 맞으면 309 SQL(309-default_lens.sql)을 아직 안 돌렸다는 뜻 — 그것부터 돌릴 것.


-- ═══════════════════════════════════════════════════════════════════════════
-- [STEP 2] 실제 삭제 — David 확인 후에만 실행 (되돌릴 수 없음)
-- ═══════════════════════════════════════════════════════════════════════════
-- 아래 주석(--)을 풀고 실행하세요.

-- begin;
--
-- alter table public.users drop column if exists position;
-- alter table public.users drop column if exists content_filter_mode;
--
-- commit;


-- ── 삭제 후 확인 ─────────────────────────────────────────────────────────────
-- select column_name
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'users'
--    and column_name in ('position', 'content_filter_mode');
--   → 0행이면 정상.
