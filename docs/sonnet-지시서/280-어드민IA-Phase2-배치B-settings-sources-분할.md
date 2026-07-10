# 지시서 280 — 어드민 IA Phase 2 배치 B: `/admin/settings` + `/admin/sources` 분할

> 설계: `ADMIN_RESTRUCTURE_PLAN.md` §5 + 어드민 IA v2. **화면 분할, 기존 API 재사용, 신규 백엔드 없음.** 새 라우트는 각자 admin 가드(`users.role==='admin'`).

전제: 278(v2 nav) 배포. 배치 A(279)와 독립 — 순서 무관.

---

## 1. `/admin/settings` 분할
현재 한 화면에 3개 무관 설정(감사 §3): 화면(local), 홈 섹션, 수집 min body. 셋으로 분리:

### 1-1. `/admin/settings` — 어드민 화면 설정 (잔존)
- `AdminAppearanceSettings`만 유지(localStorage; `src/lib/admin/appearance.ts`). 그룹: **시스템 설정**. 라벨 `시스템 설정` 유지(또는 `어드민 화면 설정`).

### 1-2. `/admin/homepage-sections` — 홈 화면 구성 (신규 라우트)
- `HomeSectionsSettings` 이동: `homepage_sections`(`GET/PUT /api/admin/homepage`). 정렬·활성 토글. 그룹: **시스템 설정**.

### 1-3. `/admin/crawl-settings` — 수집 설정 (신규 라우트)
- `CrawlSettings` 이동: `crawl_settings`(`GET/PATCH /api/admin/crawl-settings`, `min_body_length`). 그룹: **수집·크롤링**(v2 배치 — 소스·크롤·제외와 함께 봐야 함).

## 2. `/admin/sources` 분할 (카탈로그 ↔ 품질/크롤)
현재 `SourceManager`가 카탈로그+크롤런+품질+import+제외생성 혼재(감사 §3).

### 2-1. `/admin/sources` — 소스 카탈로그 (슬림)
- `sources` CRUD + import만: 직접 `sources` Supabase, `POST /api/admin/sources/import`. 활성/타입/방식/신뢰도. 그룹: **수집·크롤링**(유지).
- 크롤 실행·상태·품질 패널 제거(아래로 이동). (제외 규칙 빠른생성 링크는 `/admin/exclusion-rules`로 딥링크만 유지 가능.)

### 2-2. `/admin/source-quality` — 소스 품질·크롤 실행 (신규 라우트)
- 소스 상태(`GET /api/admin/source-status`) + 품질(`GET /api/admin/source-quality`) + **크롤 실행/진행**(`GET/POST /api/admin/crawl-now`).
- 소스별 수집/보류/거부/중복비율·마지막 오류, 소스별 크롤 트리거. 그룹: **수집·크롤링**. SQL 미적용 시 graceful(감사: source-quality 저하 허용).

## 3. nav 반영 (`src/lib/admin/nav.ts`)
- 수집·크롤링: `소스 관리`(/admin/sources) + `크롤 실행 로그`(/admin/crawl-logs) + `제외 규칙` + **신규 `소스 품질`(/admin/source-quality)** + **신규 `수집 설정`(/admin/crawl-settings)**.
- 시스템 설정: `시스템 설정`(/admin/settings) + **신규 `홈 화면 구성`(/admin/homepage-sections)** (+ 279의 `시스템 유지보수`).
- 278의 8그룹·라벨·active/open 유지. 신규 라우트 active 정상.

## 4. 회귀 가드
- API 시그니처·동작 불변(화면 이동만). local appearance는 localStorage 그대로.
- 각 신규 라우트 admin 가드.
- source-quality/crawl-settings SQL 미적용 graceful.
- `/admin/settings`에서 홈섹션·수집설정 제거돼도 잔존 화면 정상.

## 5. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- settings=화면설정만, 홈섹션·수집설정 별도 라우트, sources=카탈로그, 품질·크롤은 source-quality.
- 각 이동 화면의 기존 API 정상 동작.
- 신규 라우트 admin 가드.
- 커밋: `refactor: 어드민 Phase2-B — settings/sources 분할(homepage-sections·crawl-settings·source-quality) (지시서 280)`.

SQL/신규 API 없음. 이 지시서는 화면 분할 + nav.
