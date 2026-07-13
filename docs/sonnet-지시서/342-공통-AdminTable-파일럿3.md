# 지시서 342 — 공통 `AdminTable` 신설 + 파일럿 3개

> 작성: Opus(플래너) · 2026-07-14 · 근거: David — *"관리컬럼과 나머지 컬럼의 분절이고, 톤앤매너가 테이블 내에서 다르다. 텍스트가 잘리거나 한눈에 테이블을 보지 못하는 어려움 (어드민 내 **모든 테이블에 대한 점검 필요**)"* + *"크롤실행로그의 테이블을 **모티브**로 삼고 개선하자"*
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 없음.** · ⚠️ **`nav.ts`·`middleware.ts`·`login`을 건드리지 말 것** (330·341 소유)
>
> **David 결정**: 파일럿 = **단순한 것 3개** · `nowrap` 강제를 **뒤집는다(기본 wrap)** — 단 §3-1 처럼 **스코프를 좁혀** 점진 적용

---

## 0. 한 줄

어드민 `<table>` **16개가 공통 컴포넌트 없이 각자 그려져** 톤앤매너가 갈렸다. 크롤 로그를 모티브로 **공통 `AdminTable`** 을 만들고, **가장 단순한 3개**에 먼저 적용해 API를 검증한다.

---

## 1. 현행 진단 (2026-07-14 워킹트리 전수 조사)

### 1.1 🔴 공통 테이블 컴포넌트가 **0개**다
`src/components/admin/ui/` 에 `AdminEmptyState`·`AdminTabs`·`StatusBadge`·`AdminFilterChip`·`AdminPageHeader`·`AdminSectionHeader`·`InfoHelp`·`AdminErrorBox` 는 있는데 **테이블만 없다.**
→ **16개 파일이 각자 그렸다.** (`<table>` 총 18개 — `RequestsBoard`·`KeywordManager` 가 2개씩)

### 1.2 편차 — 세어봤다 (눈대중 아님)

| 항목 | 갈래 |
|---|---|
| **td 패딩** | `px-4 py-3` **11** / `px-3 py-2` **2** / `px-4 py-2.5` **1** / `px-4 py-2` **1** / `py-3`(좌우 패딩 없음) **1** |
| **th 배경** | `bg-muted` **10** / `bg-muted/40` **2** / `bg-muted/60` **1** / 없음 **2** / **thead 자체가 없음** **1**(`KeywordManager`) |
| **th 타이포** | `text-xs`+uppercase **6** / `text-[11px]`+uppercase **1** / `text-xs`(uppercase 없음) **1** / `admin-table-th` **2** / th마다 `font-medium` 개별 **나머지** |

> ⚠️ **모티브(`CrawlLogsTable`)가 th 타이포에선 오히려 아웃라이어다** — `text-[11px]` 를 **혼자** 쓴다. **구조는 모티브를 따르되, 타이포는 다수(`text-xs`)에 맞춘다.**

### 1.3 🔴 복붙이 진짜 문제다

| 공통 컴포넌트 | 쓰는 파일 | 안 쓰는 파일 |
|---|---|---|
| **`AdminEmptyState`** | **5** | **11** — 전부 인라인 `rounded-lg border border-dashed border-border py-16 text-center` 를 **복붙** |
| **`StatusBadge`** | ~10 | **6** — 수제 `rounded-full bg-muted px-2.5 py-0.5 text-xs` 를 손으로 반복 |
| **로딩 스피너** | — | **7개 파일이 똑같은 문자열**(`py-16` + `Loader2`)을 각자 적었다 |
| **`admin-table-th`/`admin-body`/`admin-caption`** (`globals.css:231-234`, `--admin-font-scale` 반응) | **2** (`RequestsBoard`·`ExclusionRulesManager`) | **14** — Tailwind 직접 지정 → **어드민 폰트 스케일 설정이 안 먹는다** |

### 1.4 ⭐ 텍스트 잘림의 **근본 원인** — 전역 CSS 한 줄

`src/app/globals.css:367-369`
```css
.admin-scope tbody td            { white-space: nowrap; }   /* ← 어드민 td 는 기본 nowrap */
.admin-scope tbody td.admin-cell-wrap { white-space: normal; }  /* 줄바꿈은 opt-in */
```
→ **줄바꿈하려면 `admin-cell-wrap` 을 셀마다 붙여야 한다.** 붙인 파일은 **5개**뿐이고, 나머지는 **`truncate`(9개 파일)로 때웠다.**
→ David가 말한 *"텍스트가 잘리거나 한눈에 테이블을 보지 못하는 어려움"* 이 **여기서 나온다.**

### 1.5 `sticky` 는 **1개뿐** — `AdminContentManager`
관리 컬럼만 `sticky right-0` + `boxShadow: inset 1px 0 0 0 var(--border)`.
→ **그래서 혼자 박스처럼 분절돼 보인다.** (David 지적) **thead sticky(헤더 고정)는 16개 어디에도 없다.**

### 1.6 기타 확인된 부채
- **`UserManager.tsx:328-332`** — role 토글이 **raw RGB 하드코딩**(`style={{ background: 'rgb(254 242 242)', color: 'rgb(220 38 38)' }}`). **유일하게 토큰 미사용 → 다크모드에서 깨진다.**
- `UserManager` 는 한 셀 안에서 shadcn `Badge` 와 `StatusBadge` 를 **섞어 쓴다.**

### 1.7 모티브 — `CrawlLogsTable.tsx` (기준으로 삼는다)
```
래퍼    overflow-x-auto rounded-xl border border-border bg-card
table   w-full min-w-[780px] border-collapse text-sm
thead>tr  border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground
tbody   divide-y divide-border
tr      transition-colors hover:bg-accent/50
th/td   px-4 py-3   (숫자열은 text-right)
숫자    text-right text-xs tabular-nums + toLocaleString()
빈상태  AdminEmptyState (테이블 자체를 렌더 안 함)
배지    StatusBadge (tone + label)
드릴다운  셀 안 숫자를 <button> 으로. 가드: 값 > 0 && canDrill
```

---

## 2. DB / SQL

**없음.**

---

## 3. 구현

### 3-1. ⭐ 전역 `nowrap` 뒤집기 — **스코프를 좁혀 점진 적용**

**David 결정은 "기본 wrap"이다. 하지만 지금 전역을 뒤집으면 16개 테이블 레이아웃이 한꺼번에 바뀐다.** 파일럿 3개를 고른 이유(깨져도 피해가 작다)가 무너진다.

`src/app/globals.css`
```css
/* 유지 — 아직 마이그레이션 안 된 13개 테이블 */
.admin-scope tbody td            { white-space: nowrap; }
.admin-scope tbody td.admin-cell-wrap { white-space: normal; }

/* 342 신규 — AdminTable 안에서만 기본 wrap. nowrap 은 opt-in */
.admin-scope .admin-table tbody td            { white-space: normal; }
.admin-scope .admin-table tbody td.admin-cell-nowrap { white-space: nowrap; }
```
> **마이그레이션이 16개 전부 끝나면 위쪽 두 줄을 지운다.** 그때가 진짜 뒤집는 시점이다. **§6 후속에 명시.**

### 3-2. `src/components/admin/ui/AdminTable.tsx` (신설)

**API 초안** — 파일럿 3개로 검증하고, 안 맞으면 고친다.

```ts
export type CellAlign = 'left' | 'center' | 'right'

export interface AdminTableColumn<T> {
  key: string
  header: ReactNode
  align?: CellAlign                    // 기본 'left'. 숫자면 'right'
  numeric?: boolean                    // true → text-right tabular-nums + toLocaleString
  nowrap?: boolean                     // 날짜·숫자처럼 줄바꿈 금지 셀 (기본은 wrap — §3-1)
  truncate?: boolean | number          // number 면 line-clamp-N
  width?: string                       // 'w-[220px]' 등
  cell: (row: T) => ReactNode          // ⭐ ReactNode. 셀 안에 <Select>·<button>이 들어간다
}

export interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  minWidth?: string                    // 'min-w-[780px]' — 파일마다 다르다(7가지 실재)
  loading?: boolean                    // 공통 스피너 (7개 파일 복붙 흡수)
  empty?: { message: string; hint?: string; icon?: LucideIcon }  // AdminEmptyState 위임
  rowClassName?: (row: T) => string    // 비활성 opacity-50 · done opacity-60 등
  onRowClick?: (row: T) => void        // NewsletterManager 만 쓴다
}
```

**하드코딩할 것** (10/16이 이미 같다 — prop으로 뺄 이유 없다)
```
래퍼    overflow-x-auto rounded-xl border border-border bg-card
table   w-full border-collapse text-sm  (+ minWidth)
thead>tr  border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground
                                        ↑ text-xs (다수). 모티브의 text-[11px] 은 따르지 않는다(§1.2)
tbody   divide-y divide-border
tr      transition-colors hover:bg-accent/50
th/td   px-4 py-3
```

**⛔ 이번에 만들지 않는 것** — `AdminContentManager` **하나만** 쓰는 기능이다. 기본으로 넣으면 **나머지 15개가 `table-fixed`·`colgroup` 을 강제로 떠안는다.**
```
selectable · resizable · stickyActions · pagination · sorting
```
→ **§6 후속.** 콘텐츠 검수 마이그레이션 때 opt-in 플래그로 추가한다.

### 3-3. 파일럿 3개 적용 — **가장 단순한 것부터** (David 결정)

| # | 파일 | 왜 여기부터 |
|---|---|---|
| **1** | `LlmManager.tsx` | **가장 단순.** 4컬럼, 읽기 전용, 정렬·필터·행액션·빈상태·로딩 전부 없음. th 배경도 없다 |
| **2** | `McpTokenBoard.tsx` | 빈상태·로딩이 **평문 `<p>`** 다. `AdminEmptyState`·공통 스피너로 흡수되는지 검증 |
| **3** | `KeywordManager.tsx` | **`<thead>` 자체가 없는** 유일한 파일. 테이블 2개. 배지를 인라인 span으로 그린다 |

**셋 다 "지금 없는 것"이 있다** — 공통화하면 **자동으로 생긴다.** 그게 이 슬라이스의 증명이다:
- `LlmManager` → 빈상태·로딩이 **생긴다**
- `McpTokenBoard` → 평문 `<p>` 가 **`AdminEmptyState` 로 바뀐다**
- `KeywordManager` → **헤더가 생긴다**, 인라인 배지가 `StatusBadge` 로 바뀐다

### 3-4. 곁다리 수정 — `UserManager:328-332` raw RGB 제거
```diff
- style={{ background: 'rgb(254 242 242)', color: 'rgb(220 38 38)' }}
+ className="... bg-destructive/10 text-destructive ..."
```
**다크모드에서 깨지는 유일한 곳**이라 지금 고친다. **테이블 마이그레이션은 하지 않는다**(파일럿 3개 밖).

---

## 4. 회귀 가드

- ⛔ **`AdminContentManager` 를 건드리지 말 것.** 2,026줄 + sticky + 리사이즈 + 벌크바 + 서버 페이지네이션. **파일럿 밖이다.** 여기 손대면 슬라이스가 터진다.
- ⛔ **전역 `.admin-scope tbody td { white-space: nowrap }` 를 지우지 말 것**(§3-1). 아직 13개가 의존한다. **`.admin-table` 스코프만 추가한다.**
- ⛔ **`nav.ts`·`middleware.ts`·`login`·`onboarding`·`mypage` 를 건드리지 말 것** (330·341·335 소유).
- ⛔ **`AdminEmptyState`·`StatusBadge`·`AdminTabs` 의 기존 API 를 바꾸지 말 것.** 다른 파일들이 쓴다. `AdminTable` 이 **그것들을 호출**한다.
- **`globals.css` 의 `admin-table-th`/`admin-table-td`/`admin-body`/`admin-caption`(`:231-234`) 은 `--admin-font-scale` 에 반응한다.** `AdminTable` 이 **이 유틸을 쓰면** 어드민 폰트 스케일 설정이 **14개 파일에도 뒤늦게 먹기 시작한다.** → **쓸지 말지 판단해 보고할 것.** (지금 2개만 쓴다)
- **파일럿 3개의 데이터·기능이 하나도 바뀌면 안 된다.** 표현만 바꾼다.
  - `LlmManager` — 공급자·모델·사용량 값
  - `McpTokenBoard` — 토큰 발급/폐기 동작
  - `KeywordManager` — 키워드 CRUD, `content_keywords` 삭제 경고 문구
- **`KeywordManager` 는 테이블이 2개다.** 둘 다 마이그레이션하되 **각각 다른 데이터**임을 확인할 것.
- **어드민 다크 테마(`AdminThemeScope`)에서 깨지지 않을 것.** 파일럿 3개를 **라이트/다크 둘 다** 확인.

## 5. 검증

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `node scripts/check-prefetch.mjs` 0건 / `npm run build` **통과 (반드시 네가 돌릴 것 — 플래너 샌드박스는 Bus error)**
- ⭐ **`grep -rn "border-dashed border-border py-16" src/components/admin/`** → 파일럿 3개에서 **사라졌는지**. (나머지 파일엔 남아 있는 게 정상)
- ⭐ **`grep -c "<table" src/components/admin/LlmManager.tsx src/components/admin/McpTokenBoard.tsx src/components/admin/KeywordManager.tsx`** → 모두 **0** 이어야 한다 (`AdminTable` 이 대신 그린다)
- ⭐ **`grep -rn "rgb(254 242 242)" src/`** → **0건**
- **화면 확인 (David)**:
  1. `/admin/llm` — 표가 그대로 뜨나. **빈 상태·로딩이 생겼나**
  2. `/admin/mcp` — 토큰 발급·폐기가 되나. 빈 상태 문구가 `AdminEmptyState` 로 바뀌었나
  3. `/admin/keywords` — **헤더가 생겼나.** 키워드 추가·수정·삭제가 되나
  4. **세 화면의 톤앤매너가 크롤 로그와 같아 보이나** ← 이게 이 슬라이스의 목적이다
  5. **라이트/다크 둘 다** 깨지지 않나
  6. `/admin/users` — role 토글 버튼이 **다크모드에서 안 깨지나**

## 6. 후속(범위 밖) — **하나씩 깬다** (David 지시)

| # | 항목 |
|---|---|
| **U2** | 나머지 13개 테이블 순차 마이그레이션 (`SourceManager`·`EntityManager`·`IssueManager`·`KeywordGroupManager`·`ExclusionRulesManager`·`RequestsBoard`·`UserManager`·`NewsletterManager`·`SourceQualityManager`·`CrawlLogsTable`·`job-runs`·`SourceImportDialog`) |
| **U3** | **`AdminContentManager`** — `selectable`·`resizable`·`stickyActions`·`pagination` opt-in 플래그를 `AdminTable` 에 추가하고 마이그레이션. **2줄형 전환**도 여기서 |
| **U4** | ⭐ **전역 `nowrap` 규칙 제거** — 16개 전부 마이그레이션되면 `globals.css:367-369` 를 지운다. **그때가 진짜 뒤집는 시점** |
| **U5** | `admin-table-th`/`admin-body` 유틸을 `AdminTable` 이 표준 채택 → **어드민 폰트 스케일이 전 테이블에 먹게** |
| **U6** | 수제 배지 6곳 → `StatusBadge` 통일 |
