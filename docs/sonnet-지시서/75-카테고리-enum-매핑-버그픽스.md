# 지시서 75 — 카테고리 enum 매핑 버그 픽스(어드민 콘텐츠 관리·검색·편집)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/categories.ts`(CATEGORY_DEFS·getCategoryDbValues) + `src/lib/types.ts`(ContentCategory·CONTENT_CATEGORY_LABEL) + `src/components/admin/AdminContentManager.tsx`(목록 필터·편집 모달) + `src/app/dashboard/search/page.tsx`(scopedSourceIds 효과) + `supabase/schema.sql`(content_category enum) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음.** 단독 커밋(긴급 버그픽스).

---

## 증상
`/admin` 콘텐츠 관리에서 **리서치/AI분석/전략보고서 탭** 클릭 시:
`콘텐츠 목록을 불러오지 못했습니다: invalid input value for enum content_category: "리서치"`

## 원인
- `content_category` enum 실제 값: `뉴스·리포트·웹인사이트·가트너·KRG·오피니언·뉴스레터·AI보고서·유튜브`.
- `CATEGORY_DEFS`(categories.ts)는 **표시 카테고리**(`리서치`·`AI분석`·`전략보고서`)를 쓰고, `getCategoryDbValues()`로 DB 값 배열에 매핑하는 설계.
- 그런데 ① `AdminContentManager` 목록 필터·검색 효과가 **매핑을 건너뛰고 표시값을 그대로** `.eq('category', …)` 에 넘김 → `리서치` enum 에러.
- ② `dbCategories` 배열에 **enum 에 없는 값**이 섞여 있음: `AI분석`→`['AI보고서','AI분석']`, `전략보고서`→`['전략보고서']`. 매핑을 거쳐도 무효값이 들어가면 깨짐.
- ③ 편집 모달이 표시값을 그대로 저장(`category: edit.category`) → `리서치` 저장 시 동일 에러.

## 작업

### 0. 유효 enum 상수 (categories.ts 또는 types.ts에 export)
```ts
// content_category enum 실제 값 (deprecated 포함 — DB가 받는 값 전체)
export const DB_CONTENT_CATEGORIES = [
  '뉴스','리포트','웹인사이트','가트너','KRG','오피니언','뉴스레터','AI보고서','유튜브',
] as const
```
- 헬퍼: `export function toDbCategories(display: ContentCategory): ContentCategory[]` = `getCategoryDbValues(display).filter(c => (DB_CONTENT_CATEGORIES as readonly string[]).includes(c))`. (무효값 `AI분석`·`전략보고서` 자동 제거)

### 1. AdminContentManager 목록 필터 (176줄 부근)
- `if (category !== 'all') q = q.eq('category', category as ContentCategory)` 를 **매핑+가드**로 교체:
```ts
if (category !== 'all') {
  const dbCats = toDbCategories(category as ContentCategory)
  if (dbCats.length === 1) q = q.eq('category', dbCats[0])
  else if (dbCats.length > 1) q = q.in('category', dbCats)
  else q = q.eq('category', '__none__' as ContentCategory) // 유효 db값 없음(전략보고서 등) → 빈 결과
}
```
- 효과: 리서치 탭 = `리포트·가트너·KRG`, AI분석 = `AI보고서`, 전략보고서 = 빈 결과(에러 아님). 탭 `value`(표시값)·소스타입 필터(CATEGORY_SOURCE_TYPE) 로직은 **그대로 유지**.

### 2. 검색 페이지 scopedSourceIds 효과 (search/page.tsx 182줄 부근)
- `.eq('category', category)` 를 동일하게 매핑:
```ts
const dbCats = toDbCategories(category)
let q = createClient().from('contents').select('source_id').eq('status','published').not('source_id','is',null)
q = dbCats.length === 1 ? q.eq('category', dbCats[0]) : q.in('category', dbCats.length ? dbCats : ['__none__'])
```
(257~260줄에 이미 `getCategoryDbValues` 쓰는 본 쿼리가 있으니, 그쪽도 무효값 가드가 필요하면 `toDbCategories` 로 통일.)

### 3. 편집 모달 — DB enum 값만 저장
- 편집 Select 후보(현 `editCategoryValues = CATEGORY_DEFS.map(d => d.category)`, 표시값)를 **실제 enum 값**으로 교체:
```ts
const EDIT_CATEGORY_OPTIONS: ContentCategory[] = ['뉴스','리포트','웹인사이트','유튜브','AI보고서']
```
  옵션 라벨은 `CONTENT_CATEGORY_LABEL[c]`. 현재 행 값이 deprecated(가트너/KRG/오피니언 등)면 그 값도 목록에 포함(현 row 깨짐 방지) — 기존 `!includes ? [edit.category] : []` 패턴 유지하되 기준 배열을 `EDIT_CATEGORY_OPTIONS` 로.
- 저장(276줄) `category: edit.category` 는 이제 항상 유효 enum → 그대로 둠.

## 회귀 / 주의
- DB·enum 무변경. `CATEGORY_DEFS`/`getCategoryDbValues` 시그니처 불변(가드 헬퍼만 추가).
- 사용자 대시보드 피드(`dashboard/contents/page.tsx`)는 이미 `getCategoryDbValues`+`.in` 사용 — 단, 거기서도 `리서치` 외 `AI분석`/`전략보고서` 탭이 무효값을 넣을 수 있으면 `toDbCategories` 로 통일(점검 후 필요 시 적용).
- `'__none__'` 가드 대신 `category` 필터 자체를 건너뛰면 "전체"가 떠버리므로, 빈 결과가 의도(전략보고서는 contents에 없음).
- UI 한국어(#1). `'use client'` 경계 불변.

## 완료 조건
- [ ] `toDbCategories` 가드 헬퍼 추가
- [ ] AdminContentManager 목록 필터·편집 모달 수정(리서치/AI분석/전략보고서 탭 에러 0)
- [ ] 검색 페이지 category 효과 매핑
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 어드민 6개 탭 전부 클릭 시 에러 없이 목록/빈상태 표시 · 편집 저장 정상

## 보고 양식
```
## 완료 보고 — 지시서 75 카테고리 enum 매핑 버그픽스
- 변경 파일: <목록>
- toDbCategories 가드 · 어드민 목록/편집 · 검색 효과 매핑 · 전략보고서=빈결과
- DB 무변경 · 검증: tsc · build · lint(신규 0) · 육안(6탭·편집)
- 미해결: 카테고리 모델 정리(AI분석/전략보고서=생성콘텐츠, contents 미존재)는 사이드바 개편에서 다룸
```

---

### 메모(근본 원인 — 개편에서 해결)
- `AI분석`·`전략보고서`는 "생성 콘텐츠"라 `content_category` enum·`contents` 테이블에 없음(메모리 결정). 그런데 `CATEGORY_DEFS`가 이를 콘텐츠 카테고리처럼 들고 있어 혼선. → **어드민 사이드바 개편 + 카테고리 모델 MECE 정리** 시 분리(콘텐츠 카테고리 vs 생성물 라우트).
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
