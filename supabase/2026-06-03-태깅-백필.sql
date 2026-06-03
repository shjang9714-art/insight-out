-- ============================================================
-- 기존 콘텐츠 소급 태깅 백필 (#24) — 2026-06-03
-- 실행: 수희 (Supabase SQL Editor) — 키워드 seed 적용 후 1회.
-- 사유: 크롤러 tagContent 는 신규 insert 시에만 동작 → 이미 쌓인 콘텐츠는 미태깅.
--       이 스크립트로 기존 전체를 1회 소급 태깅(크롤러와 동일한 substring·대소문자무시 매칭).
-- 멱등: on conflict do nothing → 여러 번 실행해도 안전. (이후 신규분은 크롤러가 자동 태깅)
-- ============================================================

begin;

-- 1) content_keywords: 제목 또는 본문(body_original)에 키워드가 포함되면 매핑
insert into public.content_keywords (content_id, keyword_id)
select c.id, k.id
from public.contents c
join public.keywords k
  on lower(c.title) like '%' || lower(k.name) || '%'
  or lower(coalesce(c.body_original, '')) like '%' || lower(k.name) || '%'
on conflict (content_id, keyword_id) do nothing;

-- 2) content_services: 매핑된 키워드의 service_id 로 콘텐츠↔서비스 (distinct)
insert into public.content_services (content_id, service_id)
select distinct ck.content_id, k.service_id
from public.content_keywords ck
join public.keywords k on k.id = ck.keyword_id
where k.service_id is not null
on conflict (content_id, service_id) do nothing;

commit;

-- 확인용:
-- select s.name 서비스, count(*) 콘텐츠수
--   from public.content_services cs join public.services s on s.id = cs.service_id
--   group by s.name order by 2 desc;
-- select count(distinct content_id) 태깅된콘텐츠 from public.content_services;
