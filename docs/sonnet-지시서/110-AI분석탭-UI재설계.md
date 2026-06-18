# 지시서 110 — AI 분석 탭 UI 재설계 (위계 + 세그먼트 sub-tab)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 다음을 읽을 것: `AGENTS.md` · `src/components/analysis/AiInsightsView.tsx`(현 5섹션 적층 — 재배치 대상) · `src/components/analysis/AnalysisTabs.tsx`(sub-tab — 세그먼트화) · `src/app/dashboard/ai-analysis/page.tsx`(탭 셸) · `src/components/dashboard/KeywordMap.tsx`(재사용) · `src/components/dashboard/CompetitorTrends.tsx`(카드 톤 참고). `npm install` 먼저.
> **신규 SQL/데이터 변경 없음.** 기존 페치 그대로, **렌더 순서·그룹·스타일만 재구성**. 참고 목업: Opus 가 제시한 "ai_analysis_tab_redesign".

---

## 배경 (David)

AI 인사이트 탭이 풀폭 5섹션 단순 적층("기능 나열")이고, 정작 핵심인 인사이트 카드가 맨 아래 묻힘. **위계 부여 + 핵심 끌어올리기**로 "읽는 순서가 있는 대시보드"로. 또 상단 카드(L1) 클릭 후 또 상단 탭이 나오는 중첩이 어색 → **sub-tab을 가벼운 세그먼트(L2)로 시각 구분**(결정 B).

## 설계 결정 (Opus, David 승인)

읽는 순서: **결론(인사이트) → 신호(토픽·경쟁사) → 탐색(키워드) → 개인(관심업체)**. 데이터 로직 불변, 배치/스타일만.

---

## 작업

### 1. sub-tab 세그먼트화(B) — `src/components/analysis/AnalysisTabs.tsx`
- L1 상단 카드와 **확연히 다른** 가벼운 **세그먼트 컨트롤**로: 작은 pill 그룹(연한 배경 트랙 + 활성 pill), 폰트 13px, 페이지 폭 좌측 정렬. "이건 AI 분석 안의 보조 뷰"임이 보이게(큰 탭처럼 보이지 않게).
- 동작(`?tab=` Link·활성표시)은 유지, 스타일만.

### 2. AiInsightsView 재배치 — `src/components/analysis/AiInsightsView.tsx`
현 섹션 순서(①뜨는토픽 ②키워드맵 ③경쟁사 ④관심업체 ⑤인사이트카드)를 아래로 재구성(데이터·집계 로직 그대로, JSX 순서/그룹/래퍼만):

- **A. 핵심 인사이트(히어로, 최상단)**: 현 ⑤ 인사이트 카드(기간별)를 **맨 위로**. **최신 기간 카드를 2열**(`grid auto-fit minmax(260px,1fr)`)로 강조(토픽 배지·헤드라인·시사점·근거). 이전 기간은 아래 "이전 인사이트"로 접거나 작게. 카드 0건이면 **"AI 인사이트 생성 대기"** 안내(어드민에서 생성/시드 전 상태) — 빈 페이지 방지.
- **B. 신호(2열)**: **뜨는 토픽 + 경쟁사 동향**을 **나란히 2열**(`grid auto-fit minmax(280px,1fr)`)로. 각각 카드 안에 컴팩트 목록(토픽=▲%/NEW, 경쟁사=업체별 논조 미니 분포 + 한 줄 요약). 풀폭 적층 금지.
- **C. 키워드 맵(띠)**: `<KeywordMap>`을 **하단 단일 밴드**로(카테고리 칩 + 클라우드 한 영역). 비중 축소.
- **D. 관심업체(최하단 요약)**: 현 ④를 **컴팩트 요약 한 줄/소형**으로(업체명·건수 + "전체 보기"). 풀 카드 그리드는 과함 → 축소. 비었으면 기존 안내 유지.

### 3. 페이지 헤더 — `ai-analysis/page.tsx`
- "AI 분석" 헤더 + 세그먼트 탭. 기존 구조 유지, 탭 컴포넌트 스타일만 반영.

## 회귀 / 주의
- **데이터·집계 로직 변경 금지** — computeTrendingTopics·경쟁사/관심업체/카드 페치 그대로. **JSX 재배치·래퍼·className만.**
- 반응형: 2열 그리드는 `auto-fit minmax`로 **모바일 1열 폴백**.
- 빈 상태 3종: 인사이트 카드 0(생성 대기)·경쟁사 키워드 미등록·관심업체 미등록 — 모두 graceful 유지.
- 색 토큰(#9)·논조 배지색(긍 emerald/중 muted/부 red, 기존)·UI 한국어(#1)·`any` 금지·서버 컴포넌트 유지(인터랙션 있는 KeywordMap만 client, 기존).
- 세그먼트 탭이 L1 카드처럼 커보이지 않게(작게·연하게) — 중첩 어색함 완화가 목적.
- 이슈/지식그래프 탭 콘텐츠(IssueBoardView/EntityBrowseView)는 이번 범위 아님(인사이트 탭만 재설계).

## 완료 조건
- [ ] AnalysisTabs 세그먼트 스타일(L2 구분)
- [ ] AiInsightsView 재배치: 인사이트 히어로(2열, 최신 우선) → 신호 2열(토픽·경쟁사) → 키워드 띠 → 관심업체 요약
- [ ] 인사이트 0건 "생성 대기" 빈상태 + 반응형 1열 폴백
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 위계 있는 대시보드로 보임, 모바일 1열, 빈상태 정상, 데이터 동일

## 보고 양식
```
## 완료 보고 — 지시서 110 AI 분석 탭 UI 재설계
- SQL: 없음(렌더 재구성만)
- 변경: components/analysis/AiInsightsView.tsx(위계 재배치), AnalysisTabs.tsx(세그먼트), ai-analysis/page.tsx(헤더)
- 인사이트 히어로↑ · 신호 2열 · 키워드 띠 · 관심업체 요약 · 세그먼트 sub-tab · 빈상태/반응형
- 검증: tsc · build · lint(신규 0) · 육안
- 미해결: 이슈/지식그래프 탭 UI 다듬기 · IA 1차 재편(C, 후속 마일스톤)
```

---

### 메모(후속)
- **C(IA 1차 재편)**: 이슈·지식그래프 1차 승격 + 콘텐츠 묶기 — 핵심 루프 완성(이슈 시드+전략보고서) & 실사용자 온보딩 직전에. (메모리 기록됨.)
- 이슈/지식그래프 탭 내부도 같은 위계 원칙으로 후속 다듬기.
- 관련: 106(탭 통합)·108(상단카드 진입)·목업 ai_analysis_tab_redesign.
