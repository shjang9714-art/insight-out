-- 333 SQL 적용 후 확인 (읽기 전용 — 아무것도 바꾸지 않습니다)
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
--
-- ⭐ 296·306·309·312·313·315·186·293 적용했다고 하셨습니다. 그게 실제로 반영됐는지 확인만 합니다.
-- ⭐ 쿼리를 하나씩(①~⑤) 돌리고 **결과 표를 그대로 캡처해서** David 에게 주세요.
--
-- ⛔ 이 파일에는 alter / drop / update 가 하나도 없습니다. 안전합니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- ① 🔴 가장 급함 — users 의 죽은 컬럼이 지워졌습니까?
-- ═══════════════════════════════════════════════════════════════════════════
--   306 파일의 [STEP 2](실제 삭제)는 **주석 처리**돼 있었습니다.
--   주석을 풀고 돌리셨다면 컬럼이 지워졌고, 그러면 어드민 사용자 목록이 지금 깨져 있습니다.
--   → 0행이 나오면 "지워졌다"(코드 수정 필요), 2행이 나오면 "안 지워졌다"(정상).

select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'users'
   and column_name in ('position', 'content_filter_mode')
 order by column_name;

--   결과 해석:
--     position, content_filter_mode  2행  → 안 지웠음. 정상. ✅
--     0행 또는 1행                        → 지웠음. **David 에게 즉시 알려주세요.** 🔴


-- ═══════════════════════════════════════════════════════════════════════════
-- ② 306 [STEP 1] — 컬럼을 버려도 되는지 판단할 숫자
-- ═══════════════════════════════════════════════════════════════════════════
--   (①이 2행이었을 때만 의미가 있습니다. 0행이면 이미 지워진 거라 건너뛰세요.)

select
  count(*)                                                as 전체_사용자,
  count(*) filter (where position is not null
                     and position <> '')                  as 직책_입력됨,
  count(*) filter (where content_filter_mode is not null) as 구_필터모드_있음,
  count(*) filter (where default_lens is not null)        as 신_기본렌즈_있음
from public.users;

--   → 직책_입력됨 = 0 이면 버려도 됩니다.
--   → 신_기본렌즈_있음 이 전체_사용자 와 같아야 309 가 제대로 적용된 것입니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- ③ 309 마이그레이션 검증 — 구 필터모드가 새 렌즈로 옮겨갔는가
-- ═══════════════════════════════════════════════════════════════════════════

select content_filter_mode, default_lens, count(*)
  from public.users
 group by 1, 2
 order by 1, 2;

--   → content_filter_mode = 'my_services'  이면  default_lens = 'mine'   이어야 정상
--   → content_filter_mode = 'all'          이면  default_lens = 'all'    이어야 정상
--   안 맞으면 309 가 덜 적용된 것입니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- ④ 296 유튜브 발행일 결손률 — 이 숫자로 296 착수 여부를 정합니다
-- ═══════════════════════════════════════════════════════════════════════════

select
  count(*)                                             as 유튜브_전체,
  count(*) filter (where published_at is null)         as 발행일_없음,
  round(100.0 * count(*) filter (where published_at is null)
        / nullif(count(*), 0), 1)                      as 결손률_퍼센트
from public.contents
where category = '유튜브';

--   판단:  0% → 296 취소 / ~5% → 라벨만 정정 / 10%+ → 백필까지

-- 카테고리별(뉴스에도 같은 문제가 있는가):
select
  category,
  count(*)                                             as 전체,
  count(*) filter (where published_at is null)         as 발행일_없음,
  round(100.0 * count(*) filter (where published_at is null)
        / nullif(count(*), 0), 1)                      as 결손률_퍼센트
from public.contents
where status = 'published'
group by category
order by 4 desc nulls last;


-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ 186 · 312 가 실제로 들어갔는가 (화면이 점등될 근거)
-- ═══════════════════════════════════════════════════════════════════════════

-- 186 — 소스 품질 RPC 가 존재하는가 (없으면 /admin/source-quality 가 "미적용" 배너를 띄웁니다)
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('source_quality_stats', 'increment_exclusion_hits', 'increment_tts_usage')
 order by routine_name;

--   → source_quality_stats 가 보여야 186 적용된 것입니다.

-- 312 — crawl_logs 에 제외 사유 컬럼이 생겼는가
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'crawl_logs'
   and column_name in ('rejected_count', 'rejected_by')
 order by column_name;

--   → 2행이 나와야 312 적용된 것입니다. 그래야 크롤 제외 건의 사유가 분해돼 보입니다.

-- 312 — 실제로 데이터가 쌓이고 있는가 (최근 7일)
select
  count(*)                                     as 실행_건수,
  sum(coalesce(rejected_count, 0))             as 제외_합계,
  sum(coalesce(inserted_count, 0))             as 신규_합계
from public.crawl_logs
where created_at >= now() - interval '7 days';

--   → 제외_합계가 0 이 아니어야 정상입니다(인수인계: 크롤 457건 중 67% 가 제외되고 있었습니다).
--     0 이면 312 적용 후 아직 크롤이 한 번도 안 돌았다는 뜻입니다.


-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ (참고) body_len — 콘텐츠 검수의 본문 상태 표시에 쓰입니다
-- ═══════════════════════════════════════════════════════════════════════════

select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'contents'
   and column_name in ('body_len', 'canonical_url', 'lgu_impact', 'sentiment')
 order by column_name;

--   → body_len 이 없으면 어드민 콘텐츠 검수에서 본문 상태가 전부 "처리됨" 으로만 보이고,
--     새로 붙인 "본문 보강" 버튼이 제대로 노출되지 않습니다.
