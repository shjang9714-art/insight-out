# 지시서 372 — 2단 네비게이션: L2 sticky 상시노출 + 호버 프리뷰 + 간격 30% 축소

> 대상: 구현 에이전트 · **신규 SQL 없음** · 전역 네비 UX
> ⚠️ 읽을 것: `src/components/dashboard/DashboardHeader.tsx`(L102 `sticky top-0 z-20`·L188~ L1 nav·`#l1-nav-row`·`#l1-active-label`·`NAV_TABS`) · `src/components/dashboard/NavGroupAlign.tsx`(L1↔L2 좌표 실측 정렬 — 이 방식을 대체) · `src/components/analysis/InsightViewTabs.tsx`(L2 탭 렌더) · `src/components/contents/ContentsBoard.tsx`(L503 `<NavGroupAlign className="-mt-3 mb-5"><InsightViewTabs/>`) · L2를 렌더하는 다른 섹션들(AI인사이트·리포트·기업동향 페이지) · `AGENTS.md`

## 배경 (David)
현재 **L1(홈/AI인사이트/기업동향/콘텐츠/리포트)은 sticky 헤더**, **L2(뉴스/유튜브/웹인사이트 등)는 페이지 본문**에 있어 스크롤하면 L2가 사라진다(NavGroupAlign이 서로 다른 트리를 DOM 좌표로 정렬하는 취약한 구조). David 요청 4가지:
1. 콘텐츠를 보거나 **아래로 스크롤할 때도 네비가 계속 보이게**(L2 포함).
2. **L2까지 항상 노출**.
3. L1에 **마우스 호버 시(클릭 전) 그 섹션의 L2 미리보기**.
4. L1↔L2 **상하 간격을 현재보다 30% 축소**.

## 방향 (권장 — L2를 sticky 헤더로 통합)
L2를 헤더로 올려 **L1+L2 2단 sticky 네비**로 만든다. 그러면 sticky·상시노출·호버·간격이 한 컨테이너에서 자연히 풀리고, **NavGroupAlign의 cross-tree 실측이 불필요**해진다(정렬이 같은 컨테이너 flex로 단순화).

### 1. L2 taxonomy 중앙화
- 각 L1 섹션의 L2 탭을 **중앙 정의**(예: `NAV_TABS`에 `children` 추가 또는 `src/lib/nav/taxonomy.ts`). 현재 페이지별로 흩어진 `InsightViewTabs` 탭 목록(콘텐츠: 뉴스·유튜브·웹인사이트, AI인사이트·리포트·기업동향 각각의 L2)을 옮겨 담는다. **기존 각 페이지의 L2 항목·URL·활성 판정과 1:1 일치**시킬 것(누락 금지 — 섹션별로 실제 렌더되던 탭을 그대로).

### 2. 헤더에 L2 행 추가 (sticky·상시노출)
- `DashboardHeader`의 sticky 컨테이너 안, L1 행 **바로 아래에 L2 행**을 렌더 — 현재 활성 L1 섹션의 L2 탭들. 활성 L2는 경로/쿼리로 판정(기존 InsightViewTabs 활성 로직 재사용).
- L2가 헤더에 있으므로 **스크롤해도 L1+L2 함께 고정**(요청 1·2). L2 항목이 없는 섹션(홈 등)은 L2 행을 비우거나 숨김(레이아웃 점프 최소화).
- **페이지 본문의 기존 L2 렌더(NavGroupAlign+InsightViewTabs)는 제거** — 중복 방지. 페이지는 L2 활성값만 URL에서 읽어 콘텐츠를 바꾼다(이미 그렇게 동작).

### 3. 호버 프리뷰
- L1 탭에 **`onMouseEnter`(+focus) 시 그 섹션의 L2를 헤더 L2 행에 미리보기**로 표시(클릭 없이). 마우스가 벗어나면 **활성 섹션의 L2로 복귀**. 키보드 접근성(focus/blur)도 동일. 활성 상태는 호버가 덮어쓰지 않게(호버=프리뷰, 클릭=확정).
- 터치/모바일(md 미만)은 기존 모바일 메뉴 유지(호버 없음).

### 4. 간격 30% 축소
- L1 행과 L2 행의 **상하 간격을 현재 대비 약 30% 축소**. 현재값: L1 링크 `py-2.5`, L2 컨테이너 `-mt-3 mb-5`, L2 링크 `pt-2 pb-1`. 이 수직 여백들의 합(L1 하단~L2 상단)을 실측/계산해 ~30% 줄인다(예: L1 `py-2.5`→`py-1.5`, L2 상단 여백 축소). 좌우 정렬·톤은 유지.

## 회귀 / 주의
- **모든 L1 섹션의 L2가 이전과 동일하게 동작**해야 함(항목·URL·활성 판정·콘텐츠 스위칭). 특히 콘텐츠(뉴스/유튜브/웹인사이트)·AI인사이트·리포트·기업동향 각각 확인.
- NavGroupAlign 제거 시 그 정렬에 의존하던 다른 화면 없나 확인(있으면 대체).
- 모바일(md 미만) 네비 회귀 금지. sticky `z-index`·backdrop 유지(콘텐츠 위로 안 겹치게). 색 토큰·`prefetch={false}`·한국어.
- 레이아웃 점프(L2 유무 섹션 전환 시) 최소화.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + (dev)각 L1 섹션 스크롤 시 L1+L2 고정 / L2 상시노출 / L1 호버 시 L2 프리뷰·이탈 시 복귀 / 간격 축소 육안 / 모바일 정상.

## 배포 게이트
⚠️ main 머지·배포 금지. **전용 worktree**(`git worktree add /private/tmp/insight-out-372 -b agent/372-nav-sticky-l2 origin/main`)에서 작업 → push+PR, 브랜치명 회신 → Opus 검증 후 머지.

## 쪼개기
① L2 taxonomy 중앙화 + 헤더 L2 행(sticky·상시노출), 페이지 본문 L2 제거 / ② 호버 프리뷰 / ③ 간격 30% 축소. 2~3커밋.
