-- 196: 원문 canonical_url 정규화 토대. 구글뉴스 리다이렉트 → 해소된 실제 원문 URL 을 별도 컬럼에 저장.
-- original_url(수집 시점 URL, 부분 유니크 인덱스 有)은 그대로 두고, canonical_url 로 교차중복 판정·원문링크에 사용.
-- unique 제약 없음(전환기 null 다수 + 하드 reject 대신 클러스터 병합). 멱등.
-- 미적용 시 196 코드는 42703 graceful(canonical 미저장, 기존 동작 유지).

alter table contents
  add column if not exists canonical_url text;

-- 충돌 조회(canonical_url 로 기존행 찾기)용 부분 인덱스
create index if not exists idx_contents_canonical_url
  on contents (canonical_url)
  where canonical_url is not null;

-- 확인:
-- select count(*) filter (where canonical_url is not null) as canon, count(*) as total from contents;
