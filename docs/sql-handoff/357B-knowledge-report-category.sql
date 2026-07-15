-- 지시서 357-B — 지식보고서 콘텐츠 카테고리 추가
-- 실행 담당: 수희 · Supabase SQL Editor에서 1회 실행
-- 신규 테이블 없음. 기존 contents + reports Storage 버킷을 재사용한다.

alter type public.content_category
  add value if not exists '지식보고서';
