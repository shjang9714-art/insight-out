# 지시서 387 — 콘텐츠 분화 (기존 `?category=` 재사용) · S4

> 작성: 플래너(Opus) · 2026-07-19 · 어드민 개편 슬라이스 S4
> 근거: `docs/어드민-개편-최종안-2026-07-17.md` §8 · 갭분석 §5 S4
> 협업 루프: 로컬(커밋X). 디렉터 위임 → 구현 → 검증 → "커밋". **SQL 없음.**
> 선행: S1(382)·S2(383)·S3(384) 배포됨.
> ⚠️ **결정 변경**: 갭분석 §6에서 `/admin/content?type=` 신설로 정했으나, 조사 결과 **기존 `AdminContentManager`에 카테고리 탭 + `?category=` 연동이 이미 구현(지시서 376)**돼 있어 신설은 2,230줄 중복이 된다. **David 승인(2026-07-19)으로 기존 재사용으로 변경.**
> 번호: 387 (382~386 사용 중)

---

## 0. 한 줄
사이드바의 **뉴스·웹인사이트·유튜브(+외부리포트)** 를 기존 `/admin/contents?category=X` 로 연결해 활성화하고, 그 과정에서 드러나는 **활성표시·페이지제목·카테고리 전환** 3가지 결함을 고친다.

---

## 1. 현행 진단 (확인된 코드 사실)

- **`AdminContentManager`(2,230줄)에 이미 카테고리 탭이 있다**(지시서 376):
  ```ts
  const ADMIN_CATEGORY_TABS = [
    { id: '뉴스',      dbCategories: ['뉴스'] },
    { id: '유튜브',    dbCategories: ['유튜브'] },
    { id: '웹인사이트', dbCategories: ['웹인사이트','오피니언'] },
    { id: '외부리포트', dbCategories: ['리포트','가트너','KRG'] },
    { id: '지식보고서', dbCategories: ['지식보고서'] },
  ]
  ```
  URL 파라미터도 이미 읽는다 — 481행 `searchParams.get('category')`(그 외 `source`·`status`·`from`·`bookmarked`), 구 라벨 호환 `adminTabIdFor()` 보유. → **분화는 사실상 구현돼 있고, 사이드바 진입점만 없다.**
- **결함 ①(활성표시)**: `AdminSidebar.isActive(href)`는 `pathname === href || pathname.startsWith(href + '/')`. href에 `?category=…`가 붙으면 pathname과 절대 일치하지 않아 **활성표시가 영원히 안 뜬다.**
- **결함 ②(페이지 제목)**: `findAdminNavItem(pathname)`(nav.ts)도 pathname만 매칭 → 쿼리 href 항목을 못 찾음 → `AdminPageHeader`가 `?? '어드민'` 폴백(19행)으로 **제네릭 제목**이 뜬다. `findAdminNavLocation`(브레드크럼)도 동일.
- **결함 ③(카테고리 전환)**: `AdminContentManager` 481행이 **`useState` 초기값으로만** `?category=`를 읽는다. 같은 라우트에서 쿼리만 바뀌는 이동은 컴포넌트가 **리마운트되지 않으므로 초기값이 재실행되지 않는다** → 뉴스에서 유튜브를 눌러도 목록이 안 바뀐다.
- `/admin/contents/page.tsx`는 서버 컴포넌트(`metadata` + `Suspense` + `AdminContentManager`), 현재 `searchParams`를 받지 않는다.
- S1(382) 기준 현행 nav: 콘텐츠 그룹에 뉴스·웹인사이트·유튜브가 `disabled '준비중'`, 그 아래 임시 항목(콘텐츠 관리·콘텐츠 추가·소스 관리·수집 설정·데이터 보강). 리포트 그룹의 `외부리포트`도 `disabled '준비중'`.

---

## 2. DB / SQL
**없음.**

---

## 3. 구현

### 3.1 `src/lib/admin/nav.ts` — 항목 활성화 + 쿼리 인식 매칭

**(a) 콘텐츠 그룹**: 뉴스·웹인사이트·유튜브의 `disabled`/`badge` 제거하고 href를 실제 경로로. **임시 `콘텐츠 관리`(`/admin/contents`) 항목은 제거**(세 항목이 대체). 나머지 임시 항목(콘텐츠 추가·소스 관리·수집 설정·데이터 보강)은 **유지**.
```ts
{ href: '/admin/contents?category=뉴스', label: '뉴스', description: '뉴스 콘텐츠 수집·검수·발행을 관리합니다.', icon: Newspaper },
{ href: '/admin/contents?category=웹인사이트', label: '웹인사이트', description: '전문기관·기업 블로그 등 고부가 콘텐츠를 관리합니다.', icon: Globe },
{ href: '/admin/contents?category=유튜브', label: '유튜브', description: '채널·영상 콘텐츠와 자막·요약을 관리합니다.', icon: Video },
```
**(b) 리포트 그룹**: `외부리포트`도 같은 방식으로 활성화(매니저가 이미 지원).
```ts
{ href: '/admin/contents?category=외부리포트', label: '외부리포트', description: '외부 PDF·PPT·문서 리포트를 등록·발행합니다.', icon: FileArchive },
```

**(c) 매칭 함수 2개를 쿼리 인식으로 확장**(기존 호출부 호환 위해 **2번째 인자는 선택**):
```ts
/** href 문자열을 pathname/쿼리로 분해 */
function splitHref(href: string): { pathname: string; params: URLSearchParams } {
  const [pathname, qs = ''] = href.split('?')
  return { pathname, params: new URLSearchParams(qs) }
}

/** href의 쿼리 조건을 현재 검색 파라미터가 모두 만족하는가 */
function queryMatches(href: string, search?: URLSearchParams | null): boolean {
  const { params } = splitHref(href)
  for (const [k, v] of params) {
    if ((search?.get(k) ?? null) !== v) return false
  }
  return true
}

export function findAdminNavItem(pathname: string, search?: URLSearchParams | null): AdminNavItem | null {
  const all = ADMIN_NAV_GROUPS.flatMap(g => g.items)
  // 1) pathname 정확일치 + 쿼리 조건 만족 (쿼리 있는 항목 우선)
  const exact = all
    .filter(i => splitHref(i.href).pathname === pathname && queryMatches(i.href, search))
    .sort((a, b) => splitHref(b.href).params.size - splitHref(a.href).params.size)[0]
  if (exact) return exact
  // 2) 폴백: pathname 최장 startsWith (기존 동작)
  return all
    .filter(i => {
      const p = splitHref(i.href).pathname
      return p !== '/admin' && pathname.startsWith(p)
    })
    .sort((a, b) => splitHref(b.href).pathname.length - splitHref(a.href).pathname.length)[0] ?? null
}

export function findAdminNavLocation(
  pathname: string,
  search?: URLSearchParams | null,
): { group: string; item: AdminNavItem } | null {
  const item = findAdminNavItem(pathname, search)
  if (!item) return null
  const group = ADMIN_NAV_GROUPS.find(g => g.items.includes(item))
  return group ? { group: group.group, item } : null
}
```
> 쿼리 파라미터 수가 많은 항목을 우선 매칭해, `?category=뉴스` 상태에서 쿼리 없는 항목이 먼저 잡히는 일을 막는다.

### 3.2 `src/components/admin/AdminSidebar.tsx` — 쿼리 인식 활성표시
```tsx
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
...
const searchParams = useSearchParams()

function isActive(href: string) {
  const [hrefPath, qs = ''] = href.split('?')
  if (hrefPath === '/admin' && !qs) return pathname === '/admin'
  const pathOk = pathname === hrefPath || pathname.startsWith(hrefPath + '/')
  if (!pathOk) return false
  if (!qs) {
    // 쿼리 없는 항목: 같은 pathname에 쿼리 있는 항목이 활성일 땐 양보한다
    const hasQuerySibling = ADMIN_NAV_GROUPS.some(g => g.items.some(it => {
      const [p, q] = it.href.split('?')
      if (p !== hrefPath || !q) return false
      return new URLSearchParams(q).get('category') === searchParams.get('category')
    }))
    return !hasQuerySibling
  }
  for (const [k, v] of new URLSearchParams(qs)) {
    if (searchParams.get(k) !== v) return false
  }
  return true
}
```
> 배지 로직(`/admin/requests`·`/admin/insights`)은 **그대로 둔다**.

### 3.3 `src/components/admin/ui/AdminPageHeader.tsx` — 검색 파라미터 전달
```tsx
import { usePathname, useSearchParams } from 'next/navigation'
...
const searchParams = useSearchParams()
const item = findAdminNavItem(pathname, searchParams)
```
(나머지 로직·폴백 `?? '어드민'` 유지)

### 3.4 `src/components/admin/ui/AdminTabShell.tsx` — 동일 전달
```tsx
const searchParams = useSearchParams()
const loc = findAdminNavLocation(pathname, searchParams)
```

### 3.5 `src/app/admin/contents/page.tsx` — 카테고리 전환 시 리마운트 (결함 ③)
`searchParams`를 받아 `key`로 넘겨 **카테고리가 바뀌면 매니저를 새로 마운트**한다. 2,230줄 매니저는 건드리지 않는다.
```tsx
export default async function AdminContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const sp = await searchParams
  return (
    <>
      <AdminPageHeader />
      <Suspense fallback={/* 기존 그대로 */}>
        <AdminContentManager key={sp.category ?? 'all'} />
      </Suspense>
    </>
  )
}
```

### 3.6 `src/app/admin/layout.tsx` — 사이드바 Suspense (빌드 대비)
`AdminSidebar`가 `useSearchParams`를 쓰게 되므로 정적생성 경계 오류가 날 수 있다. 빌드가 `useSearchParams() should be wrapped in a suspense boundary` 로 실패하면 **`<AdminSidebar />`를 `<Suspense fallback={null}>`로 감싼다**. (실패하지 않으면 불필요 — 빌드로 판단)

---

## 4. 회귀 가드
1. **`AdminContentManager.tsx`(2,230줄)는 수정 금지.** 카테고리 전환은 §3.5의 `key` 리마운트로만 해결한다.
2. `findAdminNavItem`의 **2번째 인자는 선택**이어야 한다 — 인자 없이 호출하는 기존 코드가 깨지면 안 된다(폴백 경로 유지).
3. **사이드바 배지 2개**(`/admin/requests`, `/admin/insights`)와 나머지 nav 그룹 **10개는 변경 금지**. 그룹 수 **11 유지**.
4. 임시 항목 중 **`콘텐츠 관리`(/admin/contents)만 제거**한다. 콘텐츠 추가·소스 관리·수집 설정·데이터 보강은 유지(후속 슬라이스에서 이동).
5. `Newspaper`·`Globe`·`Video`·`FileArchive` 아이콘은 이미 import 돼 있다(382). **미사용이 되는 import가 생기면 제거**(lint 실패 방지) — 특히 `콘텐츠 관리` 제거로 `Newspaper` 사용처가 줄지만 뉴스가 쓰므로 유지된다.
6. 카테고리 값은 **한글 그대로**(`뉴스`·`웹인사이트`·`유튜브`·`외부리포트`) — `ADMIN_CATEGORY_TABS.id` 와 정확히 일치해야 한다. URL 인코딩은 브라우저/Next가 처리.
7. `지식보고서`는 별도 라우트(`/admin/knowledge-reports`)가 있으므로 **이번에 건드리지 않는다.**

---

## 5. 검증
```bash
npx tsc --noEmit
npm run lint
npm run build      # ← useSearchParams/Suspense 경계 확인(§3.6)

grep -c "group: '" src/lib/admin/nav.ts                       # 11
grep -n "category=뉴스\|category=웹인사이트\|category=유튜브\|category=외부리포트" src/lib/admin/nav.ts   # 4줄
grep -n "queryMatches\|splitHref" src/lib/admin/nav.ts        # 추가됨
git diff --stat   # nav.ts·AdminSidebar·AdminPageHeader·AdminTabShell·contents/page(+layout) 만
git diff --stat src/components/admin/AdminContentManager.tsx  # 비어야 함
```
로컬 육안:
- 사이드바 콘텐츠 그룹에 **뉴스·웹인사이트·유튜브**가 활성(준비중 배지 없음), 리포트 그룹에 **외부리포트** 활성.
- 각 항목 클릭 → 해당 카테고리 목록만 표시, **페이지 제목이 그 이름**으로 표시(‘어드민’ 아님).
- **뉴스 → 유튜브 → 웹인사이트 연속 클릭 시 목록이 매번 바뀐다**(결함 ③ 해소).
- 클릭한 항목만 **활성 하이라이트**, 나머지 콘텐츠 항목은 비활성.
- `/admin/contents`(쿼리 없이) 직접 접근해도 전체 목록이 정상 표시.
- 다른 페이지(대시보드·사용자·시스템 설정 등) 제목·활성표시 **회귀 없음**.

---

## 6. 후속 (범위 밖)
- 각 콘텐츠 화면에 소스 관리·수집 실행·수집 이력 **탭 내장**(S2 `AdminTabShell` 적용) → 그때 임시 항목(소스 관리·수집 설정·데이터 보강) 제거.
- `외부리포트` 전용 등록 화면(현재는 목록만, 등록은 `/admin/upload`).
- 카테고리별 기본 필터·정렬 프리셋.

---

## 7. 라이브 체크리스트
- [ ] 뉴스·웹인사이트·유튜브·외부리포트가 사이드바에서 활성이고 각각 다른 목록을 연다.
- [ ] 항목 간 연속 이동 시 목록이 매번 갱신된다.
- [ ] 페이지 제목·브레드크럼이 카테고리 이름으로 뜬다.
- [ ] 활성 하이라이트가 하나만 켜진다.
- [ ] 운영 게시판·핵심인사이트 배지가 그대로 뜬다.
