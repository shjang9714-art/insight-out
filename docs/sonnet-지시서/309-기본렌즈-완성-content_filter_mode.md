# 지시서 309 — 개인화 완성: `content_filter_mode` → **기본 렌즈(default_lens)**

> 작성: Opus(플래너) · 2026-07-12 · 근거: David 결정(**304 = "미구현을 완성한다"**)
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 있음**: `docs/sql-handoff/309-default_lens.sql` (수희, 멱등).
> **308(마이페이지)보다 먼저.** 308이 이 설정을 "살아 있는 설정"으로 전제한다.

---

## 0. 한 줄

**저장은 되는데 안 쓰이던 설정**(`content_filter_mode`)과 **쓰이는데 저장이 안 되던 설정**(lens)을 **하나로 합친다.** 그리고 **개인화가 아예 없던 콘텐츠 목록에 렌즈를 붙인다.**

---

## 1. 현행 진단 (검증된 코드 사실)

### 1.1 ⭐ 두 개의 반쪽짜리 개인화

| | 저장 | 읽는 곳 |
|---|---|---|
| **`users.content_filter_mode`** (`'my_services' \| 'all'`) | **DB** | **없음** — 온보딩·마이페이지에서 저장만 하고 아무도 안 읽는다 |
| **lens** (`'mine' \| 'watch' \| 'all'`) | **localStorage `io:lens`만** | AI인사이트 · 이슈 · 기업동향 · 관계지도 |

- `content_filter_mode`: **"담당 서비스만"을 골라도 아무 일도 일어나지 않는다.**
- lens: `useActiveLens()`(`src/lib/lens.ts`)가 **localStorage만** 읽는다. 기본값 `'all'`.
  → **기기를 바꾸면 초기화된다. 온보딩에서 고른 값이 반영되지 않는다.**

> **둘은 경쟁하는 시스템이 아니라 서로의 빈 구멍이다.** 하나로 합친다.

### 1.2 ⭐ 콘텐츠 목록에는 개인화가 **아예 없다**
`src/app/dashboard/contents/page.tsx` — **`lens` 참조 0회.**
→ *"콘텐츠 보기 방식"* 이라는 설정의 **적용 대상 화면 자체가 개인화되어 있지 않다.** 이게 "미구현"의 실체다.

### 1.3 lens가 이미 갖춘 것 (재사용할 것 — 새로 만들지 말 것)
```
src/lib/lens.ts
  LensKey = 'mine' | 'watch' | 'all'
  LENS_PRESETS       — 라벨·설명 ('내 업무' / '내 관심사' / '전체')
  useLensContext()   — user_services + user_watchlist 로딩 (모듈 캐시)
  matchesLens() / lensScore()
  useActiveLens()    — localStorage + 'lens:changed' 이벤트 브로드캐스트
src/components/lens/LensSwitcher.tsx   — 전환 UI (이미 존재)
```
사용처: `InsightCardsSectionClient` · `IssueBoardClient` · `EntitiesPageClient` · `KnowledgeGraph`

### 1.4 담당 서비스 테이블은 `user_services`다
(`user_service_prefs`가 아니다 — `lens.ts` · `mypage` · `onboarding` 전부 `user_services`.)

---

## 2. DB / SQL — **있음**

`docs/sql-handoff/309-default_lens.sql` (수희):
- `users.default_lens text not null default 'all' check (default_lens in ('mine','watch','all'))` **추가**
- 기존 값 백필: `content_filter_mode = 'my_services' → 'mine'`, `'all' → 'all'`, NULL → `'all'`
- **`content_filter_mode` 컬럼은 지우지 않는다** — 롤백 여지를 남긴다. 폐기는 **306**(오픈 후).
- 멱등(`if not exists` 가드).

> **왜 새 컬럼인가**: 기존 컬럼은 이름(`content_filter_mode`)과 값(`my_services`)이 lens 개념과 안 맞는다. CHECK만 늘리면 **이름은 콘텐츠 필터인데 값은 렌즈**가 되어 다음 사람이 또 헷갈린다. **이번 슬라이스의 목적이 그 혼란을 없애는 것이다.**

---

## 3. 구현

### 3-1. `default_lens`를 lens의 **DB 기본값**으로 승격

```
users.default_lens (DB)   = 내 기본 보기      ← 온보딩·마이페이지에서 설정
localStorage io:lens      = 지금 이 세션의 전환 ← 화면 상단에서 임시로 바꿈
```

**`src/lib/lens.ts` 수정**
- `useActiveLens()`가 **localStorage가 비어 있으면 DB의 `default_lens`로 초기화**한다.
  - 우선순위: `localStorage` → **DB `default_lens`** → `'all'`
  - DB 조회는 **`useLensContext`의 기존 1회 fetch에 얹어라**(`loadLensContext`가 이미 user를 가져온다). **쿼리를 새로 추가하지 말 것.**
- **`localStorage`에 값이 있으면 그게 이긴다.** 사용자가 지금 화면에서 바꾼 게 우선이다.
- **⚠️ 하이드레이션 주의**: `useActiveLens`의 `useState` 초기화가 SSR에서 `'all'`이다. DB 값이 비동기로 오므로 **깜빡임(flash)** 이 생길 수 있다. 초기 로딩 중에는 렌즈 전환 UI를 **비활성/스켈레톤**으로 두거나, 컨텍스트 로드 후 반영할 것.
- **`'lens:changed'` 이벤트 브로드캐스트는 그대로 유지.** 기존 4개 화면이 이걸로 동기화한다.

### 3-2. ⭐ 콘텐츠 목록에 렌즈 붙이기 (§1.2 — "미구현"의 본체)

`src/app/dashboard/contents/page.tsx`
- 상단에 **`LensSwitcher`를 붙인다**(기존 컴포넌트 재사용. 새로 만들지 말 것).
- `matchesLens(lens, ctx, target)`로 목록을 거른다.
  - `target.names` = `[title, ...matched_keywords, ...matched_groups]`
  - `target.serviceIds` = 콘텐츠에 서비스 연결이 있으면 그것(없으면 생략)
- **`'all'`이면 지금과 완전히 동일해야 한다.** 필터를 안 거는 것과 같아야 한다.
- **정렬·페이지네이션·기존 필터(카테고리·검색)와 충돌하지 않게 할 것.**

> ⚠️ **서버 페이지네이션과 클라이언트 필터의 충돌** — 이 슬라이스의 유일한 난점이다.
> 서버에서 20건 가져와 클라이언트에서 렌즈로 거르면 **"1페이지에 3건만 보임"** 이 된다.
> **해결**: 렌즈 조건을 **서버 쿼리에 반영**하라(`matched_keywords`/`matched_groups` overlap, 서비스 id in). 클라이언트 후처리로 때우지 말 것.
> 서버 쿼리로 표현이 어려우면 **`mine`/`watch`는 "우선 정렬"(lensScore desc)로 처리하고 필터링은 하지 않는 방식**도 허용한다 — **다만 그 경우 라벨을 "우선 보기"로 정확히 쓸 것.** 거른다고 해놓고 안 거르면 안 된다.

### 3-3. 설정 UI — 값만 살린다 (UI 개편은 308)

- **온보딩**(`Step1Profile.tsx` · `onboarding/page.tsx`) · **마이페이지**(`mypage/page.tsx`)
  - 저장 대상을 `content_filter_mode` → **`default_lens`** 로 바꾼다.
  - 선택지를 **3개**로: `내 업무(mine)` / `내 관심사(watch)` / `전체(all)`. **`LENS_PRESETS`의 라벨·설명을 그대로 쓸 것**(문구를 새로 짓지 말 것).
  - **UI 배치·디자인은 지금 그대로 둔다.** 재구성은 **308**에서 한다. **이 슬라이스는 배선만 한다.**
- ⚠️ 온보딩에서 이 토글이 **서비스 선택을 조건부로 감추는 로직**이 있다 → **서비스 선택은 항상 보이게** 할 것. `watch`를 골라도 담당 서비스는 받아야 한다.

### 3-4. 저장 즉시 반영
마이페이지에서 `default_lens`를 바꾸면 **`localStorage`도 함께 갱신하고 `'lens:changed'`를 dispatch**한다. 안 그러면 *"설정을 바꿨는데 화면이 그대로"* 가 된다 — **지금 문제와 똑같아진다.**

---

## 4. 회귀 가드

- **`'all'`일 때 콘텐츠 목록이 지금과 100% 동일해야 한다.** 기본값이 `'all'`이므로, 이게 깨지면 전원이 영향받는다.
- **`LensSwitcher`·`lens.ts`를 새로 만들지 말 것.** 기존 것을 확장한다.
- **기존 4개 화면(AI인사이트·이슈·기업동향·관계지도)의 렌즈 동작이 바뀌면 안 된다.** `'lens:changed'` 이벤트·localStorage 키(`io:lens`)를 유지할 것.
- **`content_filter_mode` 컬럼을 지우지 말 것**(§2). 읽기만 멈춘다. 폐기는 306.
- **`useLensContext`의 쿼리를 늘리지 말 것** — 이미 모듈 캐시로 1회만 돈다.
- ⚠️ **서버 페이지네이션 ↔ 렌즈 필터 충돌**(§3-2). "1페이지에 3건"이 되면 실패다.
- ⚠️ **온보딩에서 서비스 선택이 항상 보일 것.**
- **거른다고 표시했으면 실제로 걸러야 한다.** 우선정렬로 타협하면 **라벨을 정직하게** 바꿀 것.

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- **SQL 미적용 상태에서도 앱이 안 깨지는지**(42703 graceful) — 수희가 SQL을 돌리기 전에 배포될 수 있다. **`default_lens` 조회 실패 시 `'all'` 폴백.**
- 콘텐츠 목록에 **렌즈 전환 UI**가 뜨고, `mine`/`watch`/`all`이 **실제로 목록을 바꾸는지**.
- ⭐ **`all`일 때 기존과 동일한 목록·건수**인지.
- ⭐ **1페이지에 몇 건만 남는 현상이 없는지**(§3-2).
- 마이페이지에서 기본 보기를 바꾸면 → **콘텐츠·AI인사이트 화면에 즉시 반영**되는지(`lens:changed`).
- **localStorage를 비우고 새로고침** → DB의 `default_lens`로 초기화되는지. (**이게 이 슬라이스의 핵심 가치다.**)
- 기존 4개 화면의 렌즈가 **그대로 동작**하는지.
- 온보딩: 선택지 3개, **서비스 선택이 항상 보이는지**.
- 커밋: `feat: 기본 렌즈(default_lens) 완성 — 콘텐츠 목록 개인화 (지시서 309)`

## 6. 후속(범위 밖)

- **308** — 마이페이지 설정 허브 재구성. **이 설정은 "살아 있는 설정"이므로 308에서 제거하지 말 것.** "📍 콘텐츠·AI인사이트·기업동향에서 이 기준으로 보여줍니다" 안내를 붙인다.
- **306** — `content_filter_mode` 컬럼 폐기 SQL(오픈 후).
- 홈 화면에도 렌즈 적용 — 별도 검토.
