-- ============================================================
-- 핸드오프 365 — 키워드 상승요인 분석: matched_keywords 대소문자 무시 매칭 RPC
-- 수희 실행: Supabase → SQL Editor 에서 1회. 멱등(create or replace).
-- 배경: contents.matched_keywords 는 배열 컬럼이라 PostgREST `.contains()`가
--   정확일치(대소문자 구분)만 지원한다. entities/keywords 테이블에서 저장표기를
--   못 찾는 경우(둘 다 미등록인 임시 키워드 등)를 위한 최종 폴백.
-- ⚠️ 코드(src/lib/keywords/detail.ts resolveMatchName)는 이 함수가 없어도
--   42883(undefined_function) 오류를 조용히 무시하고 입력값을 그대로 쓰도록
--   이미 방어돼 있음 — 이 SQL 미적용 상태로도 기존 기능은 회귀하지 않는다.
-- ============================================================

create or replace function public.resolve_matched_keyword_casing(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select k
  from (
    select unnest(matched_keywords) as k, collected_at
    from public.contents
    where status = 'published'
      and collected_at >= now() - interval '90 days'
  ) matched
  where lower(k) = lower(p_name)
  order by collected_at desc
  limit 1
$$;

grant execute on function public.resolve_matched_keyword_casing(text) to authenticated, anon;
