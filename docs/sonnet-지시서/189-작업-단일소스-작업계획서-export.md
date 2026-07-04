# 지시서 189 — 작업 단일 소스 + 작업계획서.md 자동 export

> 작성: Opus(Cowork) · 2026-07-03 · 레인: 운영 협업 / 기록
> 근거: David — "작업 현황 단일 소스 = DB 보드, 작업계획서.md는 자동 export/스냅샷." 187 보드에 작업(work) 항목을 담고, 작업계획서.md를 DB에서 생성.
> 협업 루프: 로컬(커밋X). David 위임 → 구현 → Opus 검증 → "커밋". **SQL 핸드오프 1건(phase/seq 컬럼). LLM 없음.**
> 선행: 187(ops_requests·보드). 188(MCP)과 상호보완(작업 항목도 MCP로 read/write 가능).

---

## 0. 한 줄

`ops_requests`에 **작업(work) 항목**(지시서/슬라이스, phase·seq·상태)을 담아 **작업 현황의 단일 소스를 DB로** 만들고, **`/api/admin/worklog/export`가 DB에서 `작업계획서.md` 형식 마크다운을 생성**한다. git의 `docs/작업계획서.md`는 그 export의 **스냅샷**(커밋은 기록 동기화 때 수행 — 배포 앱은 git에 못 씀).

## 1. 현행 진단 (검증된 코드 사실)

- 187: `ops_requests`(post_type request/announcement/**work**), 상수 `lib/admin/ops-requests.ts`, 보드 `RequestsBoard`.
- 현재 작업 현황 = git `docs/작업계획서.md` 수동 관리(#P 신호등). David: **DB를 단일 소스로, md는 생성물**.
- 배포 앱(Vercel)은 read-only fs·git 미접근 → **앱은 md를 "생성해 반환"만**. 파일 쓰기·커밋은 로컬(Sonnet/MCP)에서.

## 2. DB / SQL (수희 핸드오프)

`docs/sql-handoff/189-ops_requests-work.sql` — `ops_requests`에 `phase text`·`seq integer` 추가(+인덱스). **먼저 커밋·푸시해 수희 적용**(컬럼 없으면 work 뷰·export는 graceful 빈/부분).

## 3. 구현

### 3-1. 작업(work) 보드 뷰 (`RequestsBoard` 확장)
- 세그먼트에 **[작업]** 추가(요청/공지/작업 — post_type 필터, L3 아님).
- 작업 항목: `phase`로 그룹핑, `seq` 정렬. 행 = 신호등(status)·제목·ref(commit SHA/지시서)·담당·메모.
- **상태→신호등 매핑**: pending ⚪대기 · in_progress 🟡진행 · done 🟢완료 · blocked 🔴블록. (색은 175/180 톤, 그린 대신 완료=positive(블루)·신호등 이모지는 텍스트.)
- 생성/수정: 제목·phase·seq·상태·ref·메모.

### 3-2. export 엔드포인트 — `/api/admin/worklog/export`(신규, GET)
- admin 인증. `ops_requests`에서 `post_type='work'` 전체 조회 → **`작업계획서.md` 형식 마크다운 생성**:
  - 헤더 + 신호등 범례(🟢완료 🟡진행 ⚪대기 🔴블록)
  - **phase별 섹션** → 항목: `신호등 제목 [ref] · 메모` (seq 순)
  - 말미 `*생성: <ISO> — DB(ops_requests) 스냅샷*`
- 응답: `text/markdown`(또는 `{ markdown }` JSON). 컬럼 미적용(42703) graceful.
- (선택) `?format=json`으로 구조화 데이터도.

### 3-3. 스냅샷 커밋 흐름(문서화 — 코드 아님)
- `docs/기록-동기화-루틴.md`(또는 신규 짧은 노트)에 **새 흐름** 명시:
  1. 작업 상태는 **DB(보드/MCP)** 에서 갱신(단일 소스).
  2. 기록 동기화 시: export 호출(또는 MCP `worklog_export`) → `docs/작업계획서.md`에 **덮어써 커밋**(Sonnet). md는 스냅샷.
- 즉 md를 손으로 편집하지 않고 **DB→export→커밋**.

### 3-4. (선택) MCP export 툴 (188 연계)
- 188 MCP에 `worklog_export()` 툴 추가 가능(마크다운 반환) → Claude가 코딩 중 최신 작업계획서 스냅샷을 받아 커밋. (188에 넣을지 여기서 넣을지는 구현 편의대로 — 스키마/엔드포인트는 189가 정의.)

## 4. 회귀 가드 / 비기능 요건

- 컬럼(phase/seq) 미적용 → work 뷰·export graceful(빈/부분). 요청·공지 무영향.
- 배포 앱은 **git/파일 쓰기 안 함** — export는 생성·반환만. 커밋은 로컬.
- 상태·타입 문자열은 187/188과 일치(단일 스키마). 어드민 한정·service_role. 신규 hex 0.
- 기존 `docs/작업계획서.md`는 유지(첫 export가 이를 대체하는 스냅샷이 됨). 기존 데이터 DB 백필은 후속(선택).

## 5. 검증 (Sonnet 자체)

1. `npx tsc --noEmit` 0 / `npx eslint` 0 / build 통과(`/api/admin/worklog/export` 라우트)
2. work 항목 생성/상태변경 → 보드 [작업] 뷰에 phase별 신호등 표시
3. export 호출 → `작업계획서.md` 형식 마크다운(범례·phase 섹션·신호등·ref·생성시각) 반환
4. 컬럼 미적용 시 graceful, 신호등 색 그린 없음
5. 요청·공지 뷰 회귀 0, 사용자 화면 무영향, 신규 hex 0

## 6. 후속 (범위 밖)

- 기존 `작업계획서.md`(#P 항목) → DB work 백필(시드 스크립트/1회).
- export 자동화(기록 동기화 트리거가 MCP export→커밋 수행).
- work 항목에 지시서 링크·커밋 자동 연결.

## 7. 라이브 검증 체크리스트 추가분

- [ ] 보드 [작업] 뷰에서 지시서/슬라이스 상태를 phase별로 관리
- [ ] export가 DB에서 작업계획서.md 형식 마크다운을 생성한다
- [ ] 기록 동기화가 DB→export→md 스냅샷 커밋으로 바뀐다(문서 반영)
- [ ] 신호등 색에 그린 없음, 사용자 화면 무영향
