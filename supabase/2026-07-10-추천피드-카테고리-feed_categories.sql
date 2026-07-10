-- 맞춤 추천 피드 개편: 개별 키워드 대신 "카테고리" 다중 선택 방식으로 전환.
-- 사용자가 고른 카테고리 키를 users.feed_categories(text[])에 저장한다.
-- 카테고리→해시태그 매핑은 앱 코드(src/lib/feed/categories.ts)가 단일 출처이며,
-- 추천 시 해시태그로 펼쳐 RPC(get_recommended_feed)의 p_hashtags 로 전달된다.
-- (users 는 기존 테이블 — 신규 GRANT 불필요)
-- 착수: 2026-07-10.

alter table public.users
  add column if not exists feed_categories text[] not null default '{}'::text[];
