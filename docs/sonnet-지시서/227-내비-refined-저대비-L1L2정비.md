# 지시서 227 — 내비 refined 정비(L1/L2 저대비·우아) + 무트 마젠타 토큰

목표: 레벨1 상단 내비와 레벨2 인페이지 탭을 **저대비·프리미엄** 톤으로 정비한다. 활성은 밝은 마젠타 채움이 아니라 **얇은 무트 마젠타 언더라인 + 굵기**로, 항목은 **좌측 정렬**, L2는 **컴팩트 지속형 탭**(호버 드롭다운 아님)으로. 상단 유틸리티 바(로고·검색·날짜·다크토글·알림·프로필)는 **유지**.

범위(David): 내비 톤/배치만. 폭은 226에서 처리. SQL 없음. 최소 터치.

톤 원칙(1.1 흡수): 마젠타는 주얼리·저대비, 위계는 굵기·여백·얇은 인디케이터. 채움 pill·2px 컬러보더·좌측 색 스트라이프 금지.

---

## 1. 현행 진단 (검증된 코드 사실)

- **L1 내비** `src/components/dashboard/DashboardHeader.tsx:314–336`: 별도 `<nav>` 행(상단 유틸바 아래), `mx-auto ... max-w-6xl` 안에서 `NAV_TABS.map`. 각 항목 `flex flex-1 items-center justify-center py-3.5 text-lg font-medium` + `after:` 언더라인. **활성**(325–328): `text-pink-600 after:bg-pink-500`(생 pink, 밝음), 비활성 `text-muted-foreground after:bg-transparent`. → **전체 균등분산(flex-1)·밝은 핑크·큰 글자.**
- **로고**: 191–200, 브랜드 전구 + "Insight Out"(브랜드색) — **유지**.
- **"오늘 업데이트 N건"**: 231–232 `text-[11px] font-medium text-brand-600`(밝은 마젠타) → 반 톤 낮춤 대상.
- **L2 (AI인사이트)** `src/components/analysis/AiInsightBoard.tsx:99–108`: `TABS.map`, 각 탭 `flex-1 rounded-xl border px-3 py-3.5 text-base font-semibold`, **활성** `border-brand-600 bg-brand-600/10 text-brand-600`(테두리+틴트 pill, 무거움·균등분산).
- **L2 (기업동향)** `src/components/entities/EntityTabs.tsx`: 큰 라운드 pill(브랜드 틴트). → **224에서 재구성 예정** — 본 지시서에서 만드는 공유 refined 탭을 224가 재사용하도록 컴포넌트화.
- 참고: 어드민은 `AdminTabs`(세그먼트 박스·활성 채움) 사용. 사용자단은 **더 가벼운 언더라인 계열**로.
- 색 토큰: globals.css `@theme inline`에 brand 계열 있음. **무트 마젠타 토큰 없음** → 신설.

---

## 2. 구현

### 2-1. 무트 마젠타 토큰 (globals.css) — 톤 원시값
`:root`/`.dark`에 활성 인디케이터용 저대비 마젠타 추가 + `@theme inline` 노출:
```css
:root      { --brand-muted: #A83E63; }   /* 저대비 무트 마젠타 (라이트) */
.dark      { --brand-muted: #C76A8A; }   /* 다크에서 보이도록 한 톤 밝게 */
/* @theme inline 안 */
--color-brand-muted: var(--brand-muted);
```
→ `text-brand-muted` / `after:bg-brand-muted` 사용 가능. **활성 언더라인·"오늘 업데이트"에 이 토큰 사용**(밝은 brand-600 대신).

### 2-2. L1 내비 refined (DashboardHeader nav 314–336)
- **좌측 정렬**: 컨테이너 `items-stretch` + 항목 `flex-1`(균등분산) 제거 → 항목을 자연폭으로 왼쪽 정렬(`flex items-center gap-1` 정도), 남는 우측 공간은 비움.
- **활성 표현**: `text-pink-600 after:bg-pink-500` → `text-foreground after:bg-brand-muted`(얇게). `after:h-0.5` → `after:h-[1.5px]`. 비활성 `text-muted-foreground after:bg-transparent`(hover 시 `after:bg-border` 정도로 은은).
- **글자**: `text-lg`(18px) → `text-[15px]` 정도로 한 단계 차분히(선택, 과하면 15~16 유지).
- 로고·유틸바 무변경.

### 2-3. "오늘 업데이트" 톤다운
231–232 `text-brand-600` → `text-brand-muted`(또는 `text-muted-foreground`). 밝은 마젠타 제거.

### 2-4. 공유 refined L2 탭 컴포넌트
`src/components/analysis/InsightViewTabs.tsx` 신설(지속형·좌측·언더라인):
```tsx
// items: {id,label}[], value, onChange (button 기반)
// 컨테이너: inline-flex items-center gap-5 (좌측 정렬), 하단 0.5px border로 탭 베이스라인(선택)
// 각 탭 button: text-[13px] py-2, 활성 = text-foreground font-medium + after 언더라인(h-[1.5px] bg-brand-muted),
//   비활성 = text-muted-foreground hover:text-foreground. 테두리·틴트·세그먼트박스 없음.
```
- **AiInsightBoard**: 99–108의 pill 렌더를 `<InsightViewTabs items={TABS} value={view} onChange={setView} />`로 교체.
- **EntityTabs(기업동향)**: 224에서 이 컴포넌트(Link 버전 포함) 재사용 예정 — 본 지시서에선 컴포넌트만 만들고 AiInsightBoard에 적용. (원하면 Link도 받도록 `asLink`/`href` 지원 추가.)

---

## 3. 회귀 가드
- 상단 유틸바(로고·검색·날짜·다크토글·알림·프로필) 무변경.
- L1 활성/비활성 판정 로직(`isTabActive`) 불변 — 스타일만.
- 다크/라이트 양쪽에서 `--brand-muted` 언더라인이 보이는지(다크 #C76A8A로 대비 확보).
- L2 탭 전환 동작·뷰 렌더 불변(스타일·좌측정렬만).
- 모바일 내비(md 미만은 별도) 영향 없는지 — L1 nav는 `hidden md:flex`라 데스크톱만.
- AdminTabs(어드민)와 시각적으로 계열은 다르되(사용자=언더라인, 어드민=세그먼트) 둘 다 저대비 유지.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규) 0, `npm run build`.
- 라이트/다크 각각 L1·L2 활성 언더라인·"오늘 업데이트" 톤 육안 확인.

## 5. 라이브 체크리스트
- [ ] L1 항목이 좌측 정렬로 모이고, 활성은 얇은 무트 마젠타 언더라인 + 진한 글자(밝은 핑크 아님).
- [ ] "오늘 업데이트 N건"이 차분한 무트 톤.
- [ ] AI인사이트 L2가 큰 pill → 컴팩트 언더라인 탭(좌측, 조용함).
- [ ] 라이트/다크 모두 자연스럽고 저대비·프리미엄.
- [ ] 로고·유틸바·모바일 내비 회귀 없음.

SQL 없음. 폭 변경 없음(226 담당). EntityTabs 적용은 224에서 공유 컴포넌트 재사용.
