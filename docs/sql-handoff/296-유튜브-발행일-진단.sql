-- 296 유튜브 발행일 결손 진단 (측정만 — 변경 없음)
-- 핸드오프: 수희 → Supabase SQL Editor. **에디터를 완전히 비우고**(Cmd+A → Delete) 붙여넣고 RUN.
-- ⭐ **결과를 David 에게 알려주세요.** 이 숫자로 296 착수 여부를 정합니다.
--
-- 배경:
--   콘텐츠 목록은 이미 발행일(published_at) 기준으로 정렬한다(기본값).
--   그런데 published_at 이 null 이면 collected_at 으로 **조용히 폴백**하고,
--   화면에는 "발행 2026년 7월 12일" 이라고 표시한다.
--   → 사용자가 발행일이라고 믿는 게 실은 수집일일 수 있다.
--
--   결손이 몇 건인지 아무도 모른다. 없는 문제를 고치지 않기 위해 먼저 센다.

-- ── 1. 유튜브 발행일 결손률 (296의 착수 기준) ────────────────────────────────
select
  count(*)                                             as 유튜브_전체,
  count(*) filter (where published_at is null)         as 발행일_없음,
  round(100.0 * count(*) filter (where published_at is null)
        / nullif(count(*), 0), 1)                      as 결손률_퍼센트
from public.contents
where category = '유튜브';

--   판단:
--     0%      → 296 취소. 할 일이 없다.
--     ~5%     → 표시 라벨만 정정("발행" → "수집"). 백필은 과하다.
--     10% 이상 → 표시 정정 + video id 재조회 백필.


-- ── 2. 카테고리별 결손률 (같은 문제가 뉴스에도 있는가) ───────────────────────
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

--   → 뉴스의 결손률이 높으면 그게 더 큰 문제다(유튜브보다 건수가 많다).


-- ── 3. 결손 유튜브 샘플 (재조회가 가능한 형태인지) ───────────────────────────
select id, title, original_url, collected_at
from public.contents
where category = '유튜브' and published_at is null
order by collected_at desc
limit 10;

--   → original_url 에 video id 가 들어 있어야 재조회가 가능하다.
--     original_url 이 비어 있으면 백필 자체가 불가능하다.
