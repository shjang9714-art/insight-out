# Insight Out — Admin Restructure Plan

> ⚠️ **재검토 중 (2026-07-17) — IA는 최종안으로 대체 방향.**
> 사이드바 그룹 구조(7그룹 객체중심)는 `docs/어드민-개편-최종안-2026-07-17.md`(11그룹 대상중심)로 **대체**된다.
> 단, 이 문서의 **audit 근거·객체↔테이블↔API 매핑·파괴적 작업 리스크 체크리스트는 구현 참고자료로 유지**한다.
> 차이·살릴 것 상세: `docs/어드민-개편-갭분석-2026-07-17.md` §4. 완전 폐기/보존 여부는 David 결정 대기.

Planning date: 2026-07-10
Source of truth: `ADMIN_SYSTEM_AUDIT.md` (repository-only audit). This document is a plan only. **No application behavior is changed here.** Route/table/file references are taken verbatim from the audit.

Goal: convert the current feature-fragmented admin into an **object-based + workflow-based** structure, delivered in three non-breaking phases.

---

## 1. Current Problem Summary

The core IA problem (audit §Executive Summary, §7): the admin **mixes objects, jobs, settings, and destructive maintenance in the same screens**, and several real backend objects have **no first-class screen**. The four clearest offenders:

- **`/admin/insights`** (`src/app/admin/insights/page.tsx`) — one screen calls **seven different admin APIs**: insight cards CRUD (`/api/admin/insights`, `/api/admin/insights/[id]`), sentiment backfill (`/api/admin/sentiment`), LGU impact (`/api/admin/lgu-impact`), YouTube tagging (`/api/admin/youtube-tagging`), YouTube summaries (`/api/admin/youtube-summary`), and competitor weekly report generation (`/api/admin/competitor-weekly`). It bundles the `insight_cards` object with unrelated content-enrichment jobs and the `competitor_weekly_reports` object.

- **`/admin/content-data`** (`src/app/admin/content-data/page.tsx`; `AdminContentProcessing`, `AdminDataReset`) — mixes **non-destructive backfills** (body, signals, canonical, thumbnails, clusters) with **destructive purges** (`POST /api/admin/contents/purge`, `POST /api/admin/youtube/purge`) on the same page, with no visual separation. Operationally risky.

- **`/admin/settings`** (`src/app/admin/settings/page.tsx`; `AdminAppearanceSettings`, `HomeSectionsSettings`, `CrawlSettings`) — three unrelated concerns in one screen: **local appearance** (localStorage), **homepage section layout** (`homepage_sections` via `/api/admin/homepage`), and **crawl threshold** (`crawl_settings` via `/api/admin/crawl-settings`).

- **`/admin/sources`** (`SourceManager`) — mixes the **source catalog** (`sources` CRUD) with **operational jobs**: crawl runs (`/api/admin/crawl-now`), source status (`/api/admin/source-status`), source quality (`/api/admin/source-quality`), CSV/text import (`/api/admin/sources/import`), and exclusion-rule creation (`/api/admin/exclusion-rules`).

Secondary problems (audit §7):
- **Hidden backend objects** with no admin screen: `llm_prompts`, `curated_groups`, `curated_companies`, `competitor_weekly_reports`, `topic_cover_images`, `content_signals`, `entity_events`, `content_views`, `bookmarks`, `signup_email_allowlist`.
- **Confusing labels**: `카테고리 분류기준` (`/admin/keywords`) also stores competitor keywords; `수집 키워드` (`/admin/keyword-groups`) also controls signals and filter patterns.
- **Sidebar state bug**: `/admin/content-data` is omitted from `SYSTEM_PATH_PREFIXES` in `src/components/admin/AdminSidebar.tsx`, so its active state can be hidden when the System group is collapsed.
- **Scattered status enums**, **AI jobs not first-class** (field markers, no `ai_jobs` table), **duplicate concepts** (YouTube as `youtube_videos` vs `contents.category='유튜브'`; "report" across `contents.category='리포트'`, storage `reports`, `ai_reports`, `competitor_weekly_reports`).

---

## 2. Target Admin IA

Seven groups. Priority: **P1** = Phase 1 (sidebar/labels only), **P2** = Phase 2 (split, reuse APIs), **P3** = Phase 3 (new object screens). Attributes per item: Korean label · English internal name · existing route to reuse · new route if needed · responsible object · related table · related API/service · main filters · main actions · related object links · priority.

### 2.1 Operations Center (운영 센터)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 운영 대시보드 | Operations Dashboard | `/admin` | — | Aggregate metrics | `contents`,`crawl_logs`,`users`,`*_usage` | `POST /api/admin/ai-refresh`; direct counts | content status, crawl status, pending users, failed jobs | AI refresh, jump to filtered lists | Contents, Crawl Runs, Users, LLM, Requests | P1 |
| 크롤링 현황 | Crawl Runs | `/admin/crawl-logs` | — | `crawl_logs` | `crawl_logs` | server query; `CrawlLogsTable` | success / partial / failed | inspect related content, retry source crawl | Sources, Content Review | keep |
| 운영 게시판 | Ops Requests | `/admin/requests` | — | `ops_requests` | `ops_requests` | `/api/admin/requests`, `/api/admin/worklog/export` | pending/in_progress/done/blocked; active/archived | create, assign, status, export worklog | SQL handoff, owner, ref | keep |
| 시스템 오류 | System Errors | — | `/admin/errors` | error fields | `crawl_logs`,`briefings`,`ai_reports`,`newsletter_recipients` | reads object error fields | failed / non-empty error | open object, mark resolved where supported | Crawl Runs, Briefings, Reports, Newsletter | P3 |

### 2.2 Collection Management (수집 관리)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 소스 관리 | Sources | `/admin/sources` | — (slim: remove crawl/quality later) | `sources` | `sources` | `sources` CRUD; `/api/admin/sources/import` | is_active, type, collection_method, trust_tier | create, edit, deactivate, import | Crawl Runs, Contents, Exclusion Rules | P2 (slim) |
| 소스 품질 | Source Quality | embedded in `/admin/sources` | `/admin/source-quality` | quality aggregate/RPC | `sources`,`crawl_logs` | `/api/admin/source-quality`, `/api/admin/crawl-now`, `/api/admin/source-status` | active/inactive, high junk, repeated failure | open source, create exclusion, run crawl | Sources, Crawl Runs, Exclusion Rules | P2 |
| 제외 규칙 | Exclusion Rules | `/admin/exclusion-rules` | — | `exclusion_rules` | `exclusion_rules`,`exclusion_candidate_ignores` | `/api/admin/exclusion-rules`, `/api/admin/exclusion-candidates` | active/inactive, reject/hold | create, edit, toggle, delete, ignore candidate | Sources, Contents by domain | keep |
| 키워드 그룹·시그널 | Keyword Groups & Signals | `/admin/keyword-groups` | — | `keyword_groups` | `keyword_groups` | direct Supabase | is_active, tag_type, kind | create, edit, toggle | Collection seeds, Signals, Content tags | rename (P1) |
| 수집 설정 | Collection Settings | embedded in `/admin/settings` | `/admin/collection-settings` | `crawl_settings` | `crawl_settings` | `/api/admin/crawl-settings` | none | update min body length | Crawl Runs, Content Review | P2 |
| 원시 수집 큐 | Raw Collection Queue | — | `/admin/raw-items` | missing `raw_items` | *(none — needs table)* | crawler orchestrator | new / duplicate / rejected / held | promote, reject, dedupe | Sources, Contents | P3 (optional; needs schema) |

### 2.3 Content Pipeline (콘텐츠 파이프라인)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 콘텐츠 관리 | Content Review | `/admin/contents` | — | `contents` | `contents` | direct Supabase; `uploadCoverFile()` | pending/published/rejected; body/link/thumbnail health | edit, publish, reject, delete, bulk, cover upload | Source, Services, Keywords, Entities, Issues | keep |
| 콘텐츠 상세 | Content Detail | `/admin/contents/[id]` | — | `contents` | `contents` | admin query; `getReportSignedUrl()` | single object | view; (add status actions later) | Source, Services, Keywords, Entities, Report file | keep |
| 콘텐츠 추가 | Manual Ingestion | `/admin/upload` | — | `contents`, storage | `contents`,storage `reports`/`report-covers` | `/api/admin/upload`,`/paste`,`/import-url`,`/cover-from-url`,`/contents/[id]/extract` | draft/published/rejected | upload PDF, paste, import URL, extract | Content Detail, storage files | keep |
| 분류 키워드 | Keywords | `/admin/keywords` | — | `keywords` | `keywords`,`services` | direct Supabase | service, is_competitor | CRUD keyword, mark competitor | Services, Content tags | rename (P1) |
| 엔티티 사전 | Entities | `/admin/entities` | — | `entities` | `entities`,`entity_aliases`,`content_entities` | `merge_entities` RPC; `/api/admin/entities/*` | entity_type, is_competitor, competitor_group | CRUD, alias, merge, normalize | Curated Companies, Entity Events | keep |
| 콘텐츠 시그널 | Content Signals | embedded in `/admin/content-data` | `/admin/content-signals` | `content_signals` | `content_signals` | `/api/admin/signals-backfill` | source, signal_type, missing | reclassify, inspect evidence | Content, Keyword Groups, Issues | P3 |
| 중복·클러스터 | Dedupe / Clusters | embedded in `/admin/content-data` | `/admin/content-clusters` | `contents.cluster_id`,canonical | `contents` | `/api/admin/cluster-backfill`,`/api/admin/canonical-backfill` | no cluster / clustered / dup candidates | merge/split/recompute | Content Detail | P2/P3 |
| 표지 자산 | Cover Assets | partial in upload/content-data | `/admin/assets/covers` | `topic_cover_images` | `topic_cover_images`,storage `report-covers`/`topic-covers` | `/api/admin/cover-from-url`,`/api/admin/thumbnail-backfill` | active/inactive, missing thumbnail | upload, replace, deactivate, backfill | Content, Entity, Keyword group | P3 |

### 2.4 AI Operations (AI 운영)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| LLM 관리 | LLM Providers | `/admin/llm` | — | `llm_settings`,`llm_usage` | `llm_settings`,`llm_usage` | `/api/admin/llm`, `/api/admin/llm-test` | enabled/disabled, over limit | toggle, test | Routing, Usage | keep (slim) |
| 모델·라우팅 | LLM Models & Routing | partial in `/admin/llm` | `/admin/llm/routing` | `llm_models`,`llm_task_routing` | `llm_models`,`llm_task_routing` | `/api/admin/llm` | active/inactive, task_type | reorder, activate/deactivate | Provider | P2 |
| 프롬프트 라이브러리 | Prompt Library | — | `/admin/prompts` | `llm_prompts` | `llm_prompts` | *(needs CRUD API)*; used by `src/lib/insight/generate.ts`, `src/lib/competitor-weekly/generate.ts`, `src/lib/reports/generate-strategy.ts` | key, recently updated | edit, preview/test | Insight jobs, Competitor/Strategy reports | P3 |
| AI 작업 로그 | AI Job Runs | scattered in `/admin/content-data`,`/admin/insights` | `/admin/ai-jobs` | field jobs / proposed `ai_jobs` | *(none — field markers)* | `/api/admin/sentiment`,`/lgu-impact`,`/youtube-tagging`,`/youtube-summary`,`/signals-backfill`,`/body-backfill` | queued/running/succeeded/failed (if table added) | run, retry, cancel | Contents, Signals, Insight cards | P3 |
| 번역 | Translation | `/admin/translation` | — | `translation_settings`,`translation_usage` | same | `/api/admin/translation-status` | enabled/disabled | toggle, backfill if exposed | Content translations | keep |

### 2.5 Insights & Reports (인사이트·리포트)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 이슈 관리 | Issues | `/admin/issues` | — | `issues` | `issues`,`issue_contents` | `/api/admin/issues/*` | draft/published/archived | CRUD, rematch, brief, candidates | Contents, Key Insights, Reports | keep |
| AI 인사이트 카드 | Insight Cards | `/admin/insights` (slim to cards) | — | `insight_cards` | `insight_cards` | `/api/admin/insights`, `/api/admin/insights/[id]` | draft/published/archived, scope | generate industry/company cards, publish/archive/delete | Contents, Issues | P2 (split) |
| 핵심 Insight 검수 | Key Insights | `/admin/key-insights` | — | `key_insights` | `key_insights` | `/api/admin/key-insights` | draft/needs_review/published/rejected | edit, feature, publish/reject | Issues | keep |
| 주간 경쟁 리포트 | Competitor Weekly Reports | generate-only in `/admin/insights` | `/admin/competitor-weekly` | `competitor_weekly_reports` | `competitor_weekly_reports` | `/api/admin/competitor-weekly` | draft/published; impact 위기/기회/관망 | generate, publish/unpublish, inspect sections | Curated Companies, Contents | P2/P3 |
| 전략보고서 관리 | Strategy Reports | user routes only; count on `/admin` | `/admin/reports` | `ai_reports`,`ai_report_sources` | `ai_reports`,`ai_report_sources` | `/api/reports/generate-strategy`, `/api/reports/[id]/publish` (지시서 274) | draft/generating/completed/failed; published_at | generate, review, regenerate, cover, publish/unpublish | User, Contents, Issues | P3 |
| 모닝브리핑 | Briefings | `/admin/briefings` | — | `briefings` | `briefings`,`tts_usage` | `/api/admin/briefings/*` | draft/published/archived/failed | TTS, highlights, publish/archive | Source contents | keep |
| 뉴스레터 | Newsletter | `/admin/newsletter` | — | `newsletter_issues`,`newsletter_recipients` | same | newsletter actions; `/api/admin/newsletter-recipients` | pending/sent/partial/failed | preview, manual send, inspect recipients | Newsletter Settings, Contents | keep |

### 2.6 Users & Analytics (사용자·분석)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 사용자 관리 | Users | `/admin/users` | — | `users` | `users` | `users/actions.ts` | approval_status, role, department | approve, reject, promote/demote | Subscriptions, Preferences, Views | keep |
| 가입 허용목록 | Signup Allowlist | — | `/admin/signup-allowlist` | `signup_email_allowlist` | `signup_email_allowlist` | *(needs CRUD API)*; SQL handoffs `239`,`240` | is_admin / non-admin | add/remove, toggle admin | User creation flow | P3 |
| 참여 분석 | Engagement Analytics | — | `/admin/analytics/engagement` | `content_views`,`bookmarks`,`archives` | same | `/api/content_views`; dashboard counts | date range, category, segment | open content, export | Content, Users | P3 |
| 사용자 선호 | User Preferences | — | `/admin/analytics/preferences` | `user_preferences`,`user_service_prefs`,`user_watchlist` | same | preference libs | source: onboarding/behavioral | inspect/reset if policy allows | Users, Services, Keywords, Entities | P3+ |
| 뉴스레터 구독자 | Newsletter Subscribers | partial `/admin/newsletter` | `/admin/newsletter/subscribers` | `newsletter_subscriptions`,`newsletter_recipients` | same | `NewsletterManager`; brevo webhook | active/inactive, frequency, recipient status | resubscribe/unsubscribe if allowed | Users, Newsletter issues | P3+ |

### 2.7 System Settings (시스템 설정)

| KO label | EN name | Existing route | New route | Object | Table | API/service | Filters | Actions | Related links | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 홈 섹션 | Homepage Sections | embedded in `/admin/settings` | `/admin/homepage-sections` | `homepage_sections` | `homepage_sections` | `/api/admin/homepage` | enabled/disabled | reorder, enable/disable | Dashboard sections | P2 |
| 화면 설정 | Appearance | embedded in `/admin/settings` | keep `/admin/settings/appearance` | local prefs | *(localStorage)* | `src/lib/admin/appearance.ts` | none | save local, reset | — | P2 |
| 뉴스레터 설정 | Newsletter Settings | `/admin/newsletter` | — | `newsletter_settings` | `newsletter_settings` | newsletter actions | enabled/disabled | save, preview, manual send | Newsletter issues | keep |
| 서비스 카탈로그 | Service Catalog | — | `/admin/services` | `services` | `services` | *(needs CRUD API)* | active if added | edit order/metadata | Users, Contents, Keywords | P3+ |
| 큐레이션 기업 | Curated Companies | — | `/admin/curated-companies` | `curated_groups`,`curated_companies` | same | `src/lib/entities/major-companies.ts`, `src/lib/competitor-weekly/**`, `src/lib/insight/generate.ts`; SQL `253`/`270` | active/inactive, competitor/watchlist | add/edit, link entity, reorder | Entities, Competitor reports | P3 |

> Placement notes: `크롤링 현황` sits in Operations Center per audit §8 (workflow view) though it is collection-related. `키워드 그룹·시그널` is placed in Collection Management (it seeds collection) while `분류 키워드`/`엔티티 사전` sit in Content Pipeline (they classify/enrich content) — this splits the current `분류 엔진` group by object role. Newsletter object (publishing) is in Insights & Reports; `newsletter_settings` is in System Settings.

---

## 3. Route Migration Map

Action vocabulary: keep · rename only · move menu group only · split · merge · hide · remove later · create new.

| Current route | Current responsibility | Problem | Target route(s) | Action |
|---|---|---|---|---|
| `/admin` | Operations dashboard | Mixed overview; cards don't deep-link | `/admin` | keep (add card links P1) |
| `/admin/sources` | Source catalog + crawl + quality + import + exclusion | Mixes object and jobs | `/admin/sources` (catalog) + `/admin/source-quality` | split |
| `/admin/crawl-logs` | Crawl execution audit | none | `/admin/crawl-logs` | move menu group only (→ Operations Center) |
| `/admin/contents` | Content review/moderation | Includes health + media | `/admin/contents` | keep |
| `/admin/contents/[id]` | Content detail | Read-only; no status actions | `/admin/contents/[id]` | keep |
| `/admin/raw` | Redirect shim to `/admin/contents` | Legacy duplicate | `/admin/contents` | remove later (after link verification) |
| `/admin/upload` | Manual ingestion | Multiple flows, same object | `/admin/upload` | keep |
| `/admin/content-data` | Backfills + destructive purges | Unrelated + risky | `/admin/ai-jobs` (backfills) + `/admin/content-signals` + `/admin/content-clusters` + Danger Zone (purge) | split |
| `/admin/translation` | Translation provider health | none | `/admin/translation` | move menu group only (→ AI Operations) |
| `/admin/llm` | Providers + usage + models + routing | Broad | `/admin/llm` (providers) + `/admin/llm/routing` | split |
| `/admin/briefings` | Morning briefing ops | none | `/admin/briefings` | move menu group only (→ Insights & Reports) |
| `/admin/issues` | Issue clusters | none | `/admin/issues` | move menu group only (→ Insights & Reports) |
| `/admin/insights` | Insight cards + 6 AI jobs + competitor weekly | Too broad (7 APIs) | `/admin/insights` (cards) + `/admin/ai-jobs` + `/admin/competitor-weekly` | split |
| `/admin/key-insights` | Weekly key insight review | none | `/admin/key-insights` | keep |
| `/admin/keywords` | Service classification keywords | Label too narrow | `/admin/keywords` | rename only (`분류 키워드`) + move menu group |
| `/admin/keyword-groups` | Collection/filter/signal groups | Label hides signals | `/admin/keyword-groups` | rename only (`키워드 그룹·시그널`) + move menu group |
| `/admin/entities` | Entity dictionary | Event timeline hidden | `/admin/entities` | move menu group only (→ Content Pipeline) |
| `/admin/exclusion-rules` | Auto-reject/hold rules | none | `/admin/exclusion-rules` | keep |
| `/admin/newsletter` | Newsletter publishing + settings | Settings vs publishing mixed | `/admin/newsletter` (+ later subscribers tab) | keep (settings surfaced in System Settings) |
| `/admin/users` | User approval/roles | Allowlist separate | `/admin/users` | keep |
| `/admin/settings` | Appearance + homepage + crawl | Three unrelated concerns | `/admin/settings/appearance` + `/admin/homepage-sections` + `/admin/collection-settings` | split |
| `/admin/requests` | Ops handoff board | Export not surfaced | `/admin/requests` | keep |
| — | Prompt editing (`llm_prompts`) | No screen | `/admin/prompts` | create new |
| — | AI job runs/logs | No screen | `/admin/ai-jobs` | create new |
| — | Strategy report admin (`ai_reports`) | No screen | `/admin/reports` | create new |
| — | Competitor weekly admin | Generate-only | `/admin/competitor-weekly` | create new |
| — | Engagement analytics | No screen | `/admin/analytics/engagement` | create new |
| — | Cover asset library (`topic_cover_images`) | No screen | `/admin/assets/covers` | create new |
| — | Signup allowlist | No screen | `/admin/signup-allowlist` | create new |
| — | Curated companies | No screen | `/admin/curated-companies` | create new |
| — | System errors | No screen | `/admin/errors` | create new |
| — | Raw collection queue | No object | `/admin/raw-items` | create new (optional; needs `raw_items`) |

---

## 4. Phase 1 — Sidebar & Labels Only (no backend change)

Scope: `src/lib/admin/nav.ts` (group/label source of truth), `src/components/admin/AdminSidebar.tsx` (rendering/active state), and relocating already-existing action buttons into a visually separated section. **No API, schema, or data behavior changes.**

1. **Reorganize sidebar groups** in `src/lib/admin/nav.ts` into the 7 target groups (§2). Every item keeps its existing route — only group membership and order change.
2. **Add missing active prefix for `/admin/content-data`**: add `/admin/content-data` to `SYSTEM_PATH_PREFIXES` in `src/components/admin/AdminSidebar.tsx` so its active state shows when landed on directly (audit §2 sidebar bug). Keep the item until Phase 2 splits it; only fix active state.
3. **Danger Zone**: on `/admin/content-data` (`src/app/admin/content-data/page.tsx`), move the destructive purge controls (`AdminDataReset` → `POST /api/admin/contents/purge`, `POST /api/admin/youtube/purge`) into a **visually separated "위험 구역 (Danger Zone)"** section — distinct border/color, collapsed by default, explicit confirm text. Backfills (`AdminContentProcessing`) stay above, unchanged.
4. **Rename confusing labels** (label text only, routes unchanged): `카테고리 분류기준` → `분류 키워드`; `수집 키워드` → `키워드 그룹·시그널`; `콘텐츠 데이터 관리` → `콘텐츠 유지보수`; optionally `AI 인사이트` → `AI 인사이트·작업` until the Phase 2 split.
5. **Dashboard card deep-links**: in `/admin` cards (`AdminOpsSignals`, `AdminContentHealth`), add links to already-supported filtered target screens where the query params already exist (e.g., pending content → `/admin/contents?status=pending`, crawl failures → `/admin/crawl-logs`, pending users → `/admin/users`). Only wire links existing screens already accept.

Exit criteria: identical behavior, reorganized/relabeled menu, `/admin/content-data` active-state fixed, purge visually isolated, dashboard cards navigate to filtered lists.

---

## 5. Phase 2 — Split Screens (reuse existing APIs)

No new backend; each new screen calls the **same APIs** already inventoried in audit §5.

1. **Split `/admin/insights`** →
   - `/admin/insights` keeps **insight cards only** (`GET/POST /api/admin/insights`, `PATCH/DELETE /api/admin/insights/[id]`).
   - Move enrichment jobs (`/api/admin/sentiment`, `/api/admin/lgu-impact`, `/api/admin/youtube-tagging`, `/api/admin/youtube-summary`) to **`/admin/ai-jobs`**.
   - Move competitor weekly generation (`/api/admin/competitor-weekly`) to **`/admin/competitor-weekly`**.
2. **Split `/admin/content-data`** →
   - Backfills (`/api/admin/body-backfill`, `/api/admin/signals-backfill`, `/api/admin/canonical-backfill`, `/api/admin/thumbnail-backfill`, `/api/admin/cluster-backfill`) → `/admin/ai-jobs` (shared) and `/admin/content-clusters` for dedupe.
   - Purge (`/api/admin/contents/purge`, `/api/admin/youtube/purge`) → dedicated **maintenance/Danger Zone** route (keeps P1 isolation).
3. **Split `/admin/settings`** →
   - `/admin/settings/appearance` (localStorage; `src/lib/admin/appearance.ts`).
   - `/admin/homepage-sections` (`/api/admin/homepage`).
   - `/admin/collection-settings` (`/api/admin/crawl-settings`).
4. **Separate source catalog from quality/crawl**: `/admin/sources` keeps `sources` CRUD + import; move crawl runs (`/api/admin/crawl-now`, `/api/admin/source-status`) and quality (`/api/admin/source-quality`) into **`/admin/source-quality`** (crawl runs also visible alongside `/admin/crawl-logs`).

Exit criteria: each split screen is object/job-scoped, calls only its existing APIs, no endpoint signatures change.

---

## 6. Phase 3 — New Object Screens

Add first-class screens for hidden objects. Some need a small CRUD API (noted); none require redesigning existing flows.

1. **Prompt Library** — `/admin/prompts` for `llm_prompts` (needs read/update API). Edit `strategy_report`, `competitor_weekly_area/summary`, `company_insight`; Korean-enforced; preview/test. Consumers: `src/lib/insight/generate.ts`, `src/lib/competitor-weekly/generate.ts`, `src/lib/reports/generate-strategy.ts`.
2. **AI Job Runs / AI Operation Logs** — `/admin/ai-jobs`. Minimum: a run log surfacing existing backfill/enrichment endpoints with counts; ideal: introduce an `ai_jobs` table for queued/running/succeeded/failed + retries (audit §7 "AI jobs not first-class").
3. **Strategy Report Admin** — `/admin/reports` for `ai_reports` + `ai_report_sources` (지시서 274/276). Review draft/generating/completed/failed + `published_at`; generate/regenerate/cover/publish. Reconcile `ai_report_sources` schema drift first (§7 risk).
4. **Competitor Weekly Report Admin** — `/admin/competitor-weekly` for `competitor_weekly_reports` (list/review, not just generate). Requires SQL `261` applied (table currently missing → PostgREST "schema cache" error).
5. **Engagement Analytics** — `/admin/analytics/engagement` for `content_views`, `bookmarks`, `archives`. Views/dwell/bookmarks by content/date; `/api/content_views` already records data.
6. **Cover Asset Library** — `/admin/assets/covers` for `topic_cover_images` + storage `report-covers`/`topic-covers`. Upload/replace/deactivate/backfill (`/api/admin/thumbnail-backfill`, `/api/admin/cover-from-url`).
7. **Signup Allowlist** — `/admin/signup-allowlist` for `signup_email_allowlist` (needs CRUD API). Add/remove email, toggle `is_admin`. Related SQL handoffs `239`, `240`.

(Also candidate, same pattern: `/admin/curated-companies` for `curated_groups`/`curated_companies`, `/admin/services`, `/admin/errors`, `/admin/content-signals`.)

---

## 7. Risk Checklist

Verify before/while implementing each phase:

- [ ] **`ai_report_sources` issue_id schema drift** — `src/app/api/reports/generate/route.ts` inserts `issue_id`, but base `supabase/schema.sql` defines only `content_id`/`youtube_video_id` (audit §4, §7). Confirm live DB, then reconcile `schema.sql` or code before building `/admin/reports` and report-sources views.
- [ ] **Duplicate `cluster_id` / index definitions in `schema.sql`** — audit §4 notes duplicate `cluster_id` and duplicate `contents_status_idx` / `contents_cluster_idx`. De-duplicate schema before any migration touching `contents`; ensure no conflicting index creation.
- [ ] **Next.js proxy/middleware convention** — admin guard lives in `src/middleware.ts`, but AGENTS says Next.js 16 requires `src/proxy.ts` exporting `proxy`; no `src/proxy.ts` exists (audit §1, §7). Don't silently rely on middleware during route additions; schedule the convention fix separately and re-verify `/admin/*` guard after adding routes.
- [ ] **Destructive purge protections** — `POST /api/admin/contents/purge` and `POST /api/admin/youtube/purge` are irreversible. Danger Zone isolation (P1) is UI-only; keep server-side admin checks, never auto-wire purge into dashboards or bulk flows, require explicit confirm text.
- [ ] **Legacy `/admin/raw` redirect** — remove only after verifying no inbound links depend on it; it currently redirects to `/admin/contents` preserving query filters (audit §1). Track referrers before removal.
- [ ] **YouTube canonical storage decision** — `youtube_videos` table vs `contents.category='유튜브'` are duplicate concepts (audit §4, §7). Decide the canonical model before building YouTube-related admin screens/jobs; mark the other legacy. Purge/tagging/summary currently operate on `contents`.
- [ ] **Report naming ambiguity** — "report" spans `contents.category='리포트'`, storage `reports`, `ai_reports` (strategy), and `competitor_weekly_reports` (audit §7). Use distinct IA labels: **Source Report** (uploaded), **Strategy Report** (`ai_reports`), **Competitor Weekly Report** (`competitor_weekly_reports`). Apply consistently in menu, routes, and headers.

Additional guardrails:
- [ ] Every new admin route repeats the `users.role === 'admin'` check (pattern per audit §5); do not rely on middleware alone.
- [ ] New screens for optional-SQL objects must degrade gracefully (`tableReady:false` / empty state) when a handoff SQL is unapplied — e.g., `competitor_weekly_reports` (SQL 261), curated tables (SQL 253/270), `ai_reports` columns (SQL 274).

---

## Phasing Summary

| Phase | Backend change | Deliverables | Risk level |
|---|---|---|---|
| 1 | none | 7-group sidebar, label renames, `/admin/content-data` active-prefix fix, Danger Zone isolation, dashboard deep-links | low |
| 2 | none (reuse APIs) | split insights / content-data / settings / sources-vs-quality | medium |
| 3 | new screens (some new CRUD APIs) | Prompt Library, AI Job Runs, Strategy Report admin, Competitor Weekly admin, Engagement Analytics, Cover Asset Library, Signup Allowlist | medium-high |

No code was modified. This document only proposes structure; implementation proceeds phase-by-phase with per-phase verification.
