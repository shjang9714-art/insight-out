# 지시서 41 — [Phase 4 후속] 검색 결과 패싯(facet) + 맥락 상속

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ **지시서 40 이후 진행**(40 의 `toExcerpt`·`tagsOf`·멀티셀렉트 컴포넌트 재사용). 작업 전 `AGENTS.md` + `src/app/dashboard/search/page.tsx`(FTS 쿼리 `textSearch('search_vector')`) + `src/app/dashboard/contents/page.tsx`(필터바·멀티셀렉트·카드/행 렌더) + `src/components/dashboard/SearchBar.tsx` 를 읽을 것. `npm install` 먼저. DB 변경 없음.
> 채택안: **A — 전역 검색 1개 유지 + 결과 화면에서 패싯으로 좁힘 + 카테고리 맥락 상속.**

---

## 배경
- 검색은 헤더 전역 1개(`SearchBar` → `/dashboard/search?q=`). 결과 페이지는 FTS 로 전체 검색만, **소스(카테고리)·출처별로 좁힐 수단 없음**.
- 목표: 세부 소스 집중 검색을 "검색 후 패싯"으로 해결. 콘텐츠 목록 필터바를 재사용.

## 파트 A — 검색 결과 패싯 필터
1. `search/page.tsx` 가 URL 파라미터 추가 수신: `category` · `src`(콤마 다중) · `svc`(콤마 다중) · `date`. (contents 페이지와 **동일 파라미터 규약**.)
2. FTS 쿼리에 패싯 적용:
   - `.textSearch('search_vector', q, …)` 유지 + `.eq('status','published')`.
   - `if (category) .eq('category', category)`
   - `srcIds.length` → `.in('source_id', srcIds)`
   - `date` → `getDateStart(date)` 로 `.gte('published_at', …)`
   - `svcIds.length` → `content_services` 선조회로 content_ids → `.in('id', ids)` (contents 페이지 패턴 복사).
3. 결과 헤더 아래 **필터바 렌더**: contents 페이지의 필터 UI(카테고리 칩/사업 멀티 pill/출처 멀티/날짜 + 활성칩 + 전체 초기화)를 **공용 컴포넌트로 추출해 양쪽에서 사용**하거나, 최소한 동일 마크업 이식. 패싯 변경 시 `q` 유지한 채 URL 갱신.
4. 결과 카드/행: **#40 의 `ContentCard`/`ContentRow` + `toExcerpt` + `tagsOf` 재사용**(카드/목록 토글도 동일하게). 기존 `SearchResultCard` 는 공용 렌더로 대체 또는 정합. select 에 `body_original, content_keywords(keywords(name)), content_services(services(name))` 추가.

## 파트 B — 맥락 상속 (현재 카테고리에서 검색 시 자동 패싯)
- `SearchBar`(헤더) 제출 시, **현재 URL 의 `category`(있으면)를 검색 URL 로 전달**: `/dashboard/search?q=...&category=현재값`. (헤더는 `usePathname`/`useSearchParams` 로 현재 category 확인.)
- 결과 페이지는 그 category 를 패싯으로 표시(칩) → 사용자가 칩을 떼면 전체 검색으로 확장. "뉴스에서 검색 → 뉴스 결과, 칩 해제 시 전체" UX.
- youtube 페이지 등에서 검색 시에도 동일 규약(해당 category 상속). category 가 없으면 전체 검색(기존 동작).

## 공용화 권장
- 필터바·카드/행을 **`components/dashboard/ContentFilters.tsx`·기존 카드 컴포넌트**로 공용화하면 contents/search 중복 제거. 범위 과하면 마크업 복제라도 동작 우선(보고에 택일 명시).

## 회귀
- 기존 전역 검색(파라미터 없을 때) 동작 동일. #40 카드 보완·#39 토글 정합.

## 완료 조건
- [ ] A 검색 결과에 category·src(다중)·svc(다중)·date 패싯 적용(FTS+필터 결합)
- [ ] A 필터바 UI(활성칩·초기화) + 카드/목록 토글·excerpt·해시태그(#40 재사용)
- [ ] B `SearchBar` 현재 category 맥락 상속·칩 해제로 전체 확장
- [ ] 파라미터 없을 때 기존 전역 검색 동작 유지
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 41 검색 패싯
- 변경 파일: <목록>
- A 패싯: <적용 파라미터·FTS 결합·렌더 재사용>
- B 맥락 상속: <SearchBar category 전달·칩 해제 확장>
- 공용화: <컴포넌트 추출 여부>
- 검증: tsc · build · lint(신규 0) · 육안(검색→패싯 좁힘)
- 미해결: <있으면>
```
