-- 212 리치 에디터(마크다운) — contents.body_markdown 컬럼
-- 핸드오프: 수희 → Supabase SQL Editor 실행. 멱등.
-- 목적: 어드민이 붙여넣기/URL 임포트로 추가하는 콘텐츠의 서식(마크다운) 원본 저장.
--   null = 평문 콘텐츠(크롤 등, 기존 body_original 렌더). 값 있으면 상세에서 react-markdown 렌더.
-- 관련: 지시서 212. 코드는 42703 graceful(컬럼 없어도 paste 저장·상세 렌더 안 깨짐) → SQL 적용 후 기능 점등.

alter table public.contents add column if not exists body_markdown text;

comment on column public.contents.body_markdown is
  '어드민 수기 작성 콘텐츠의 마크다운 원본(붙여넣기/URL 임포트 서식 편집, 지시서 212). null=평문. 검색·스니펫은 body_original(평문) 사용.';

-- 확인:
-- select id, (body_markdown is not null) as has_md from public.contents where body_markdown is not null limit 5;
