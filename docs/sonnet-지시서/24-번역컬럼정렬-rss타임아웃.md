# 지시서 24 — translation_usage 컬럼 정렬(SQL) + rss-parser 타임아웃

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Codex) · 검증: Opus · 커밋: 구현 에이전트
> 배경: 운영 로그에서 2건 확인 — (1) `translation_usage.chars` 컬럼 없음(수희 DB는 `char_count`로 생성됨, 정본 코드·마이그레이션·RPC는 모두 `chars`), (2) 한 피드(과기정통부 ECONNRESET)가 60초를 잡아먹어 함수 타임아웃 → rss-parser 타임아웃 미설정.
> ⚠️ 작업 전 `supabase/2026-06-06-번역사용량.sql`(정본=chars)·`src/lib/translate/index.ts`·`src/lib/crawler/adapters/news-site.ts` 를 읽을 것. **코드는 chars 유지**(변경 금지), DB를 정본에 맞춤.

## 파트 A — 컬럼 정렬 SQL (Codex 작성 → 수희 실행)
`supabase/2026-06-07-번역사용량-컬럼정렬.sql`(멱등):
- 일부 환경에 `char_count`로 생성된 컬럼을 정본 `chars`로 rename(존재할 때만), 그리고 정본 RPC 재적용.
```sql
-- translation_usage 컬럼명 정본(chars) 정렬: 일부 DB가 char_count 로 생성됨
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='translation_usage' and column_name='char_count'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='translation_usage' and column_name='chars'
  ) then
    alter table public.translation_usage rename column char_count to chars;
  end if;
end $$;

-- 정본 RPC 재적용 (chars 사용 보장; char_count 기반으로 만들어졌을 가능성 차단)
create or replace function public.increment_translation_usage(
  p_provider text,
  p_period text,
  p_chars bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.translation_usage (period, provider, chars, updated_at)
  values (p_period, p_provider, greatest(p_chars, 0), now())
  on conflict (period, provider) do update
  set chars = public.translation_usage.chars + excluded.chars,
      updated_at = now();
$$;
```
- 코드(`translate/index.ts`·`translation-status/route.ts`)는 이미 `chars` 참조 → **수정 없음**. 정렬 후 `chars` 컬럼·RPC 일치 확인.

## 파트 B — rss-parser 타임아웃 (코드)
- `news-site.ts` 의 `new Parser({...})` 옵션에 **`timeout: 12000`**(ms) 추가. 한 피드가 느리거나 차단(ECONNRESET 등)돼도 ~12초에 실패 → `crawlOne` 의 소스별 격리(allSettled)로 다른 소스 수집 계속, 60초 함수 타임아웃 방지.
- (선택) youtube 어댑터도 동일 패턴이면 같은 타임아웃 적용. 한국어/수집 로직·dedup·태깅 불변.

## 건드리지 말 것
- 번역 코드의 `chars` 참조, dedup·태깅·스키마 구조(컬럼명 정렬 외)·RLS 불변. service_role 서버 전용.

## 완료 조건
- [ ] `2026-06-07-번역사용량-컬럼정렬.sql`(rename if char_count + 정본 RPC 재적용, 멱등)
- [ ] `news-site.ts` Parser `timeout: 12000` (필요시 youtube도)
- [ ] 코드 chars 참조 불변, 크롤러/dedup/태깅/RLS 불변
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 24 컬럼정렬 + rss 타임아웃
- 변경 파일: <목록>
- A 컬럼정렬 SQL: supabase/2026-06-07-번역사용량-컬럼정렬.sql (수희 실행 대기)
- B rss 타임아웃: <적용 위치>
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
