-- 지시서 50 — 수집 4분류 데이터 모델 재편
-- 수희가 Supabase SQL Editor에서 실행. STEP 1 → 커밋 확인 → STEP 2 순서 필수.
--
-- ⚠️ Postgres 제약: 새 enum 값(ADD VALUE)은 "추가한 트랜잭션 안에서는 사용 불가".
--    따라서 STEP 1(스키마 변경)을 먼저 실행·커밋한 뒤, STEP 2(데이터 UPDATE)를 별도로 실행한다.
--    한 번에 붙여넣으면 enum 오류 발생 가능.

-- ===== STEP 1: 스키마 (먼저 실행·커밋) =====

-- 1) source_type: opinion_channel → web_insight (무손실 rename)
alter type source_type rename value 'opinion_channel' to 'web_insight';

-- 2) collection_method enum + sources 컬럼
create type collection_method as enum ('rss', 'api', 'html', 'manual', 'youtube');
alter table public.sources
  add column collection_method collection_method not null default 'rss';

-- 3) content_category 에 '리포트' 추가 (오피니언은 이미 '웹인사이트' 값 존재 → 추가 불필요)
alter type content_category add value if not exists '리포트';

-- (여기서 커밋. 새 enum 값 사용은 다음 단계에서.)


-- ===== STEP 2: 데이터 (STEP 1 커밋 후 별도 실행) =====

-- 4) collection_method 백필
update public.sources set collection_method = 'youtube' where type = 'youtube_channel';
update public.sources set collection_method = 'manual'  where type = 'report_publisher';
-- news_site / web_insight 는 default 'rss' 유지

-- 5) 카테고리 마이그레이션
update public.contents set category = '웹인사이트' where category = '오피니언';
update public.contents set category = '리포트'     where category in ('가트너', 'KRG');
-- 뉴스레터 category 콘텐츠: 크롤러는 생성하지 않으므로 거의 없음.
--   있으면 수희·David 확인 후 개별 처리(기본은 그대로 두고 UI에서만 제외).
