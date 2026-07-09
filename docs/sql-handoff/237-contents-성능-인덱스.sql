-- 237 contents 성능 인덱스 — 데이터 증가에 따른 목록/피드 느려짐 방지
-- 핸드오프: 수희 → Supabase SQL Editor. ⚠️ CONCURRENTLY 는 트랜잭션 밖에서 "한 문장씩" 실행할 것
--   (Supabase SQL Editor에서 여러 문장 한 번에 실행 시 CONCURRENTLY가 실패할 수 있음 → 한 줄씩 실행).
-- 근거(2026-07-09 쿼리 점검):
--   · contents 목록: status='published' + category IN(...) ORDER BY published_at|collected_at DESC + range(pagination)
--   · FeedSlot 폴백: status='published' + published_at >= X ORDER BY published_at DESC LIMIT 18
--   · 경쟁사(entities): collected_at >= X ORDER BY collected_at DESC
--   현행: published_at desc 단일 인덱스는 있으나 (1) collected_at 일반 인덱스 없음(수집순·일별그룹·경쟁사·최근필터가 full scan+sort)
--         (2) category+정렬 복합 인덱스 없음 → 카테고리별 목록이 데이터 증가 시 느려짐.
--   status='published'는 대부분 행이라 저선택도 → 단독 인덱싱 이득 적음(복합 프리픽스로만 활용).

-- ① collected_at 정렬 전반 (수집순·일별묶음·경쟁사·최근필터) — 가장 큰 갭
create index concurrently if not exists contents_collected_at_idx
  on public.contents (collected_at desc);

-- ② 카테고리별 발행순 목록 (콘텐츠 탭 기본 정렬)
create index concurrently if not exists contents_category_published_idx
  on public.contents (category, published_at desc);

-- ③ 카테고리별 수집순 목록
create index concurrently if not exists contents_category_collected_idx
  on public.contents (category, collected_at desc);

-- 검증(적용 후, 대표 쿼리에 EXPLAIN ANALYZE 권장 — Seq Scan → Index Scan 전환 확인):
-- explain analyze
--   select id,title,published_at from public.contents
--   where status='published' and category='뉴스'
--   order by collected_at desc limit 30;
-- explain analyze
--   select id,title,published_at from public.contents
--   where status='published' and published_at >= now() - interval '5 days'
--   order by published_at desc limit 18;

-- 참고(별도 확인): entity_signal_summary(브리핑 탭, order by signal_count desc)가 테이블이면
--   signal_count 인덱스 유무 확인. 뷰/집계면 대상 아님. — 이번 범위 밖, 필요 시 후속.
