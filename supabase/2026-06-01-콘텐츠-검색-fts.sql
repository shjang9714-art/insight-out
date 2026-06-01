-- ============================================================
-- Insight Out — 콘텐츠 전문 검색 (Full-Text Search) 마이그레이션
-- 대상 DB: 이미 Phase 1-B 테이블이 올라가 있는 Supabase 프로젝트
-- 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행
-- 안전: 멱등성 보장 — 이미 있으면 skip / 오류 없이 재실행 가능
-- ============================================================


-- ============================================================
-- 1. search_vector 컬럼 추가 (없으면)
-- ============================================================

alter table public.contents
  add column if not exists search_vector tsvector;


-- ============================================================
-- 2. 자동 갱신 트리거 함수
--    가중치: 제목(A) > 요약(B) > 번역 본문(C)
--    'simple' 사전: 불용어·어간 변환 없이 토큰 그대로 → 한국어에 적합
-- ============================================================

create or replace function public.contents_search_vector_update()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')),              'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary_ko, '')),         'B') ||
    setweight(to_tsvector('simple', coalesce(new.body_translated_ko, '')), 'C');
  return new;
end;
$$;


-- ============================================================
-- 3. 트리거 등록 (INSERT / UPDATE 모두)
-- ============================================================

drop trigger if exists contents_search_vector_trigger on public.contents;
create trigger contents_search_vector_trigger
  before insert or update on public.contents
  for each row execute function public.contents_search_vector_update();


-- ============================================================
-- 4. GIN 인덱스 (FTS 쿼리 전용 — 없으면 생성)
-- ============================================================

create index if not exists contents_search_vector_idx
  on public.contents using gin(search_vector);


-- ============================================================
-- 5. 기존 데이터 backfill
--    신규 INSERT 전에 이미 들어있는 row 도 벡터 채우기
-- ============================================================

update public.contents
set search_vector =
  setweight(to_tsvector('simple', coalesce(title, '')),              'A') ||
  setweight(to_tsvector('simple', coalesce(summary_ko, '')),         'B') ||
  setweight(to_tsvector('simple', coalesce(body_translated_ko, '')), 'C')
where search_vector is null;
