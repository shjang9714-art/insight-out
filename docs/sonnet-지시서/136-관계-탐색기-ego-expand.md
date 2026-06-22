# 지시서 136 — 관계 탐색기: ego-expand 다차원 누적 + 렌즈 하이라이트

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 확인: `src/components/entities/KnowledgeGraph.tsx`(현 ego 그래프·재중심·entity_neighbors RPC·엣지 툴팁) · `src/components/entities/EntitiesPageClient.tsx`(그래프/목록 토글·렌즈) · `src/lib/lens.ts`(matchesLens 재사용) · `docs/sql-handoff/116-entity-neighbors.sql`(RPC, 이미 적용).
> **코드 전용(SQL 없음).** `entity_neighbors`·`entity_pair_contents` RPC 기존 가동. `npm install` 먼저.
> ⚠️ **하드코딩 hex 예외**: 이 컴포넌트는 canvas 렌더라 CSS 변수 불가 → 기존 `TYPE_COLOR` hex 유지가 정상(코드 주석 L60 명시). hex-0 룰은 이 파일의 canvas 색에 적용 안 함.

---

## 배경

현 `KnowledgeGraph`는 ego 그래프지만 **노드 클릭 = 재중심(replace)** 이라 한 번에 1홉만 보임. David 비전 = **"키워드/엔티티 하나 둘러싼 1차→2,3,4차원 연결을 점진적으로 펼침"** = **누적 확장(expand-in-place)**. 재중심을 누적 확장으로 바꿔 진짜 ego-expand 탐색기로. + 렌즈(132) 매칭 노드 하이라이트로 "내 관점" 연결 부각.

**원칙(브레이크)**: 엔티티 그래프 한정(키워드/토픽 노드 혼합·경로탐색은 v2). 누적은 **상한(노드 ~60)** 으로 hairball 방지. 코드 전용.

---

## A. 재중심 → 누적 확장 (핵심)

`KnowledgeGraph.tsx` 상태/동작 변경:
- 기존 `centerId`(단일) + replace → **`rootId`(시작 중심) + `expandedIds: Set<string>` + 누적 `nodes`/`links`**.
- 시작: `rootId`(initialCenter/검색/프리셋 선택) 1홉 로드 → root 확장됨 표시.
- **노드 클릭 동작**:
  - **미확장 노드 클릭 → 확장**: 그 노드의 `entity_neighbors`(p_limit 12 정도) 조회 → **새 노드/엣지를 기존 그래프에 병합**(노드·엣지 dedupe). 그 노드 `expandedIds`에 추가.
  - **이미 확장된 노드 클릭 → 포커스**(카메라 센터/하이라이트, 재요청 없음). (또는 무동작.)
- **상한 가드**: 누적 노드 ≥ `MAX_NODES`(60)면 확장 중단 + 안내("상한 도달 — 초기화 후 다른 경로 탐색"). 확장 시도 노드만 더해도 초과면 skip.
- **시각 구분**: 확장된 노드=채움+테두리, **미확장 노드=점선/옅음 + "클릭해 확장" 힌트**(hover label). root=기존 강조 유지.
- **엣지 dedupe**: (min(src,tgt),max) 키로 중복 병합, weight 큰 값 유지.

## B. 탐색 제어
- **"초기화"** 버튼: 누적 비우고 `rootId` 1홉만 남김.
- **"한 단계 취소(undo)"**: 마지막 확장으로 추가된 노드/엣지 롤백(확장 스택 유지). (기존 history 패턴 대체.)
- 검색/프리셋으로 새 중심 선택 → 누적 리셋 후 그 노드를 rootId로 새 탐색.
- 상단 표시: `중심 · 노드 N · 확장 M단계` (기존 카운트 라인 확장).

## C. 렌즈 하이라이트 (132 연계)
- `useLensContext`+`useActiveLens`로 각 노드의 LensTarget(`{ names:[canonical_name], isCompetitor }`) → `matchesLens` 매칭 시 노드에 **렌즈 링**(canvas: 별도 hex, 예 brand `#E6007E` 또는 강조색) + 범례에 "내 관점" 표시. `all`이면 무변화.
- (서비스 매칭은 엔티티 service_id 필요 시 노드 데이터에 포함; 없으면 이름/경쟁사 기준만.)

## D. 유지(회귀 0)
- 엣지 호버 → `entity_pair_contents` 공동 기사 툴팁 · 타입 필터 범례 · 검색/프리셋 · RPC 미적용/이웃 없음 폴백 · 반응형(ResizeObserver) 전부 보존.
- `EntitiesPageClient` 그래프/목록 토글·렌즈 스위처 무변경(그래프 뷰만 동작 강화).

---

## E. v2 (짓지 않음)
- 키워드/토픽 노드 혼합(엔티티 외 차원) · 키워드맵(#94) 흡수.
- **연결 경로 탐색**("X와 Y는 어떻게 연결?" 최단 경로 하이라이트) · 워치리스트 두 노드 연결 시 "so what" 배지.
- 서버 사이드 대규모 이웃·커뮤니티 검출(GraphRAG).

---

## 검증 (구현 에이전트)
- `npx tsc --noEmit` 0 / `npx eslint`(변경 파일) 0. (canvas hex는 예외 — A 주석.)
- 노드 클릭 → **누적 확장**(재중심 아님), 미확장/확장 시각 구분, 상한 60 가드.
- 초기화·undo 동작, dedupe(중복 노드/엣지 0).
- 렌즈 하이라이트(매칭 노드 링), `all` 무변화.
- 회귀 0: 엣지 툴팁·타입필터·검색·프리셋·폴백 보존.
- 커밋·푸시.

## 운영 순서
1. 구현·커밋·푸시 → 배포(`/api/version` 캐시버스트). (SQL 없음 = 즉시.)
2. David: 기업 화면 그래프 뷰 → 경쟁사 중심 → 이웃 클릭으로 2·3홉 펼치며 관계 누적 탐색, 렌즈 하이라이트 확인.

## 다음 (예고)
- 재무 트랙(DART 소싱 후, v2) · 키워드 차원 통합(관계 탐색기 v2). [메뉴별-기능갭-분석 §10]
