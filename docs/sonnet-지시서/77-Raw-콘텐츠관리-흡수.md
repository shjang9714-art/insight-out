# 지시서 77 — Raw 데이터 뷰를 콘텐츠 관리로 흡수(드릴다운 통합)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/components/admin/AdminContentManager.tsx`(필터 상태·쿼리·탭) + `src/app/admin/contents/page.tsx` + `src/app/admin/page.tsx`(KPI 카드 링크, 지시서 74) + `src/components/admin/DashboardCharts.tsx`(세그먼트 클릭 라우팅) + `src/app/admin/raw/page.tsx`(흡수 대상) + `src/lib/categories.ts`(COLLECTED_CATEGORY_DEFS·toDbCategories) + `src/lib/date.ts` 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음.** 단독 커밋. **전제: 지시서 75·78 머지**(같은 파일).

---

## 배경 (David 결정)
별도 `/admin/raw` 테이블과 `콘텐츠 관리`는 같은 `contents`의 다른 뷰 → 메뉴/코드 중복. **Raw를 콘텐츠 관리로 흡수**: 콘텐츠 관리가 URL 초기필터(대시보드 드릴다운)를 수용하고, 대시보드·차트 링크는 `/admin/contents?...` 로, `/admin/raw` 는 콘텐츠 관리로 리다이렉트.

## 작업

### 1. `AdminContentManager` — URL 초기필터 + 오늘/북마크 필터
- `useSearchParams`(next/navigation) 추가. 마운트 시 초기 상태를 URL에서 읽음:
  - `category` → `category` 상태(아래 탭 정규화), `status` → `status`, `source` → `sourceId`(빈/`null` 처리: `source=null` 이면 `SOURCE_NULL`), `from=today` → `todayOnly=true`, `bookmarked=1` → `bookmarkedOnly=true`.
- 새 상태 2개: `const [todayOnly,setTodayOnly]=useState(false)`, `const [bookmarkedOnly,setBookmarkedOnly]=useState(false)`. 초기값은 URL.
- 쿼리(현 172~184줄 블록)에 추가:
  - `if (todayOnly) q = q.gte('collected_at', getKstTodayStartIso())`
  - `if (bookmarkedOnly) q = q.gt('bookmark_count', 0)`
  - select 에 `bookmark_count` 포함(현재 `collected_at` 은 이미 있음; 표시는 선택).
- `useEffect` 의존성 배열에 `todayOnly, bookmarkedOnly` 추가(페이지 1 리셋 포함).
- **카테고리 탭 정규화**: 대시보드 차트는 DB 값(뉴스/리포트/웹인사이트/유튜브/AI보고서)을 넘김. `categories.ts` 에 헬퍼 `export function tabCategoryFor(value: string): string` 추가 — `COLLECTED_CATEGORY_DEFS` 중 `category===value || dbCategories.includes(value)` 인 def 의 `category` 반환, 없으면 원값. 초기 `category` 세팅에 적용(예: `리포트`→`리서치` 탭 활성). 탭에 없는 값(예: `AICATEGORY`=AI보고서)이면 탭은 '전체'로 두되 칩으로 표시.

### 2. 활성 필터 칩(투명성)
- 툴바 아래에 **활성 필터 칩 행**: `오늘 수집`(todayOnly), `북마크됨`(bookmarkedOnly), `소스: {name}`, (category/status 는 기존 탭/셀렉트로 보이면 생략 가능). 각 칩 `×` 클릭 시 해당 상태 해제 + 페이지 1.
- URL 동기화는 **불필요**(초기 1회만 읽음). 칩 해제는 상태만 변경(주소창 갱신 안 해도 됨). 단, 새로고침 시 URL 기준 재적용은 그대로.

### 3. 대시보드(74) 링크를 `/admin/contents` 로
- `src/app/admin/page.tsx` KPI 카드 `href`: `/admin/raw` → **`/admin/contents`**, `/admin/raw?from=today` → `/admin/contents?from=today`, `?status=pending`, `?bookmarked=1` 동일 치환. 활성 소스 카드(`/admin/sources`) 유지.
- **리서치 반영 카드**: 현재 `/admin/raw?research=1`(AI보고서 데이터 0·전용 뷰 없음). → **비링크**(`<div>`)로 바꾸고 하단에 `준비중` 표기(또는 값만 표시). `/admin/raw?research=1` 의존 제거.
- `DashboardCharts.tsx` 세그먼트 클릭 `router.push('/admin/raw?...')` 3곳(카테고리·상태·소스) → `'/admin/contents?...'` 로 치환.

### 4. `/admin/raw` → 리다이렉트
- `src/app/admin/raw/page.tsx` 본문 테이블 제거 → **서버 리다이렉트**: `searchParams`(await) 를 그대로 `/admin/contents` 로 넘겨 `redirect('/admin/contents' + qs)`(next/navigation `redirect`). `research` 파라미터는 드롭(콘텐츠 관리 미지원). 레거시 링크/북마크 호환 유지.
- 보조 컴포넌트(`PageHeader`/`FilterChips`)는 함께 삭제.

## 회귀 / 주의
- DB 무변경. 콘텐츠 관리 기존 기능(탭·소스·검색·상태변경·편집·일괄)은 그대로 + 오늘/북마크 필터·URL 초기필터만 추가.
- `bookmark_count`·`collected_at` 은 contents 컬럼(존재). admin RLS(is_admin) 로 조회 가능.
- 탭에 없는 카테고리(AI보고서 등) 드릴다운은 칩으로 표시되고 목록은 정상 필터(탭 비활성 허용).
- 사이드바(76)에 Raw 항목은 원래 없음 — 변경 없음.
- `'use client'` 경계 불변. UI 한국어(#1)·토큰 색(#9).

## 완료 조건
- [ ] AdminContentManager: URL 초기필터(category/status/source/from/bookmarked) 수용 + todayOnly·bookmarkedOnly 쿼리 + 활성 필터 칩
- [ ] `tabCategoryFor` 정규화(리포트→리서치 등)
- [ ] 대시보드 KPI 카드·차트 세그먼트 링크 `/admin/contents` 로 치환, 리서치 카드 비링크화
- [ ] `/admin/raw` 서버 리다이렉트(+보조 컴포넌트 삭제)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 대시보드 카드/차트 클릭 → 콘텐츠 관리에 필터 적용 표시 · 오늘/북마크 필터 동작 · `/admin/raw?...` 진입 시 콘텐츠 관리로 리다이렉트

## 보고 양식
```
## 완료 보고 — 지시서 77 Raw 흡수
- 변경 파일: AdminContentManager.tsx, categories.ts(tabCategoryFor), admin/page.tsx, DashboardCharts.tsx, admin/raw/page.tsx(리다이렉트)
- URL 초기필터+오늘/북마크 필터+칩 · 대시보드 링크 /admin/contents · raw 리다이렉트 · 리서치 카드 비링크
- DB 무변경 · 검증: tsc · build · lint(신규 0) · 육안(드릴다운·필터·리다이렉트)
- 미해결: 없음(리서치 반영 뷰는 AI보고서 단계에서)
```

---

### 메모
- 흡수로 `/admin/raw` 라우트는 리다이렉트 셸만 남음(후속 완전 제거 가능).
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
