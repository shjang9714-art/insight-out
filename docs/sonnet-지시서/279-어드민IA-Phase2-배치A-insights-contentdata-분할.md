# 지시서 279 — 어드민 IA Phase 2 배치 A: `/admin/insights` + `/admin/content-data` 분할

> 설계: `ADMIN_RESTRUCTURE_PLAN.md` §5 + 어드민 IA v2. **Phase 2는 화면 분할이되 기존 API를 그대로 재사용**(신규 DB·API·백엔드 로직 없음). 새 라우트는 페이지·컴포넌트 이동 + nav 항목 추가. **각 신규 라우트에 admin 가드(`users.role==='admin'`) 필수.**

전제: 278(v2 nav) 배포. 기존 API는 감사 §5 인벤토리 그대로.

> ✅ **확정: 안1** (David 결정) — **AI/데이터 작업 트리거를 `/admin/ai-jobs`로 통합**(insights 보강 잡 + content-data 백필), purge는 `/admin/maintenance`로, `/admin/content-data`는 nav에서 제거(라우트는 `/admin/ai-jobs`로 리다이렉트 유지). 근거: v2에서 `/admin/ai-jobs`가 "데이터 보강 등 오래 걸리는 작업"을 담당하도록 정의됨 → 보강·enrichment 잡을 한 콘솔에 통합해 파편화 방지.

---

## 1. `/admin/insights` 분할
현재 한 화면에서 7개 API 호출(감사 §3). 세 갈래로 분리:

### 1-1. `/admin/insights` — 인사이트 카드 전용 (슬림)
- `insight_cards`만: `GET/POST /api/admin/insights`, `PATCH/DELETE /api/admin/insights/[id]`.
- 카드 생성(산업/기업)·검수·발행/보관/삭제. 그룹: **인사이트·리서치**(유지). 라벨 `인사이트 카드`(278).
- 나머지 잡 버튼 제거(아래로 이동).

### 1-2. `/admin/competitor-weekly` — 경쟁사 주간 리포트 (신규 라우트)
- `competitor_weekly_reports`: 생성(`POST /api/admin/competitor-weekly`) + 최근 리포트 목록/상태(draft/published, impact 위기·기회·관망) 표시(기존 query helper 재사용).
- 그룹: **인사이트·리서치**. 261 SQL 미적용 시 graceful(빈 상태·오류 안내).

### 1-3. AI 콘텐츠 보강 잡 → `/admin/ai-jobs`로 이동 (아래 2와 공유)
- `sentiment`(`/api/admin/sentiment`)·`lgu-impact`(`/api/admin/lgu-impact`)·`youtube-tagging`(`/api/admin/youtube-tagging`)·`youtube-summary`(`/api/admin/youtube-summary`) 트리거를 `/admin/ai-jobs`로 이동.

## 2. `/admin/content-data` 분할 (안1)
### 2-1. `/admin/ai-jobs` — AI·데이터 작업 (신규 라우트, 그룹: AI 운영)
- **통합 작업 콘솔**: insights에서 온 보강 잡(1-3) + content-data의 백필 잡을 한 화면에.
  - 백필: `body-backfill`, `signals-backfill`, `canonical-backfill`, `thumbnail-backfill`, `cluster-backfill`(전부 기존 `/api/admin/*` 그대로).
- 각 잡: 실행 버튼 + 진행/결과 카운트(기존 응답 형태 표시). **API·동작 불변, UI 재배치만.**
- 라벨 `AI 작업 관리`(v2 후보). admin 가드.

### 2-2. `/admin/maintenance` — 시스템 유지보수 (신규 라우트, 그룹: 시스템 설정)
- 파괴적 purge만: `GET/POST /api/admin/contents/purge`, `GET/POST /api/admin/youtube/purge`.
- 278의 **Danger Zone 스타일 유지**(경고 보더·기본 접힘·확인 문구). admin 가드.

### 2-3. `/admin/content-data` 처리
- nav 항목 **제거**(콘텐츠·분류에서). 라우트는 **`/admin/ai-jobs`로 리다이렉트**(북마크 호환) — `/admin/raw` 리다이렉트 패턴과 동일.
- (안2 선택 시: content-data를 '콘텐츠 데이터 보강'으로 남기고 백필 유지, purge만 2-2로. 이 경우 2-1은 insights 보강 잡만 이동.)

## 3. nav 반영 (`src/lib/admin/nav.ts`)
- 인사이트·리서치: `인사이트 카드`(/admin/insights) + `이슈 관리` + `핵심 Insight` + **신규 `경쟁사 주간 리포트`(/admin/competitor-weekly)**.
- AI 운영: `LLM 관리` + `번역 관리` + **신규 `AI 작업 관리`(/admin/ai-jobs)**.
- 시스템 설정: `시스템 설정`(/admin/settings) + **신규 `시스템 유지보수`(/admin/maintenance)**.
- 콘텐츠·분류: `콘텐츠 데이터 보강`(/admin/content-data) 항목 **제거**(안1).
- 278의 8그룹·라벨·active/open 유지. 신규 3라우트 active 정상.

## 4. 회귀 가드
- 모든 기존 API 시그니처·동작 불변(화면만 이동).
- 각 신규 라우트 admin 가드(비관리자 차단).
- purge Danger Zone 보호 유지, 대시보드·자동화에 purge 미연결.
- 261 미적용 시 competitor-weekly graceful.
- `/admin/content-data` 리다이렉트로 404 없음.

## 5. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- insights=카드만, 잡은 ai-jobs, competitor-weekly 별도, purge=maintenance(Danger Zone), content-data→리다이렉트.
- 기존 API 호출 정상(각 잡 실행·카운트).
- 신규 라우트 admin 가드.
- 커밋: `refactor: 어드민 Phase2-A — insights/content-data 분할(ai-jobs·competitor-weekly·maintenance) (지시서 279)`.

SQL/신규 API 없음. 이 지시서는 화면 분할 + nav.
