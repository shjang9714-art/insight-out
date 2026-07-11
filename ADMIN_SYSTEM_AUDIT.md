# Insight Out Admin System Audit

Audit date: 2026-07-10  
Scope: repository inspection only. This report is based on application code, `supabase/schema.sql`, and SQL handoff files under `docs/sql-handoff/`. It does not confirm which handoff SQL files have been applied to the live Supabase database.

No application behavior was changed for this audit.

## Executive Summary

| Area | Finding |
|---|---|
| Admin routes | The admin surface has 22 page routes under `src/app/admin`. Most are active. `/admin/raw` is a legacy redirect shim. `/admin/contents/[id]` is a detail route linked from content tables but not exposed directly in the menu. |
| Admin menu | The sidebar source of truth is `src/lib/admin/nav.ts`, rendered by `src/components/admin/AdminSidebar.tsx`. Every visible menu item maps to an existing screen, but several screens are broad operational bundles rather than object-specific screens. |
| Route guard | Admin UI access is guarded in `src/middleware.ts`. The project guide says this Next.js 16 app should use `src/proxy.ts` exporting `proxy`; no `src/proxy.ts` exists. Admin API handlers mostly repeat their own role checks. |
| Data model | The backend is object-rich: sources, contents, issues, entities, insights, reports, briefings, newsletter, LLM routing, translations, operational requests, exclusion rules, and settings. Several real objects have no dedicated admin screen. |
| Pipeline gap | There is no durable `raw_items` table or raw-item review queue. Crawling moves feed items directly through filter/dedupe into `contents`, with `crawl_logs` only recording counts and errors. |
| Main IA issue | The admin IA mixes objects, jobs, settings, and destructive maintenance operations in the same screens. `/admin/insights`, `/admin/content-data`, `/admin/settings`, and `/admin/sources` are the clearest examples. |

## 1. Admin Route Structure

### Route Guard And Layout

| Concern | Current code | Notes |
|---|---|---|
| Admin layout | `src/app/admin/layout.tsx` | Wraps admin pages with `AdminThemeScope`, `AdminSidebar`, and a fixed-width main content area. |
| Admin access guard | `src/middleware.ts` | Redirects non-admin users from `/admin/*` to `/dashboard`. It also skips profile checks for `/api/*` and relies on API route handlers for admin API authorization. |
| Next.js 16 convention mismatch | `src/middleware.ts`; missing `src/proxy.ts` | The project guide says middleware must live in `src/proxy.ts` with an exported `proxy` function. This is an audit finding only; no code was changed. |
| Admin API authorization | `src/app/api/admin/**/route.ts`, `src/app/admin/*/actions.ts` | Most handlers call Supabase auth, check `users.role === 'admin'`, then use `createAdminClient()` from `src/lib/supabase/admin.ts`. |

### Page Routes

| Route path | File | Rendered page/component | Status |
|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | Dashboard page with `AdminPageHeader`, `AdminTodoBlock`, `AdminOpsSignals`, `AdminContentHealth`, `DashboardCharts`, `AiRefreshButton` | Used. Mixed operational overview. |
| `/admin/sources` | `src/app/admin/sources/page.tsx` | `SourceManager` | Used. Manages sources plus crawl jobs, source quality, and exclusion shortcuts. |
| `/admin/crawl-logs` | `src/app/admin/crawl-logs/page.tsx` | Summary cards and `CrawlLogsTable` | Used. Object-specific for crawl execution logs. |
| `/admin/contents` | `src/app/admin/contents/page.tsx` | `AdminContentManager` | Used. Main content moderation and CRUD surface. |
| `/admin/contents/[id]` | `src/app/admin/contents/[id]/page.tsx` | Content detail/article view using `ContentArticleView`, `StatusBadge` | Used as a detail route. Not a menu item. Mostly read-only. |
| `/admin/raw` | `src/app/admin/raw/page.tsx` | Redirects to `/admin/contents` preserving some query filters | Duplicated/legacy. Redirect shim, no standalone screen. |
| `/admin/upload` | `src/app/admin/upload/page.tsx` | `ContentAddTabs` with upload, paste, URL import flows | Used. Manual ingestion screen. |
| `/admin/content-data` | `src/app/admin/content-data/page.tsx` | `AdminContentProcessing`, `AdminDataReset` | Used. Mixed backfills and destructive data reset actions. |
| `/admin/translation` | `src/app/admin/translation/page.tsx` | `TranslationStatusManager` | Used. Provider status and usage. |
| `/admin/llm` | `src/app/admin/llm/page.tsx` | `LlmManager` | Used. Provider status, usage, routing, model tests. |
| `/admin/briefings` | `src/app/admin/briefings/page.tsx` | `BriefingManager` | Used. Morning briefing operations. |
| `/admin/issues` | `src/app/admin/issues/page.tsx` | `IssueManager` | Used. Issue CRUD, rematch, brief generation, candidate generation. |
| `/admin/insights` | `src/app/admin/insights/page.tsx` | Client page implementing insight card list and multiple AI job buttons | Used. Broad mixed screen for insight cards, sentiment, LGU impact, YouTube tagging/summary, competitor weekly report generation. |
| `/admin/key-insights` | `src/app/admin/key-insights/page.tsx` | `KeyInsightsManager` | Used. Weekly key insight review/edit/publish. |
| `/admin/keywords` | `src/app/admin/keywords/page.tsx` | `KeywordManager` | Used. Service classification keyword catalog. |
| `/admin/keyword-groups` | `src/app/admin/keyword-groups/page.tsx` | `KeywordGroupManager` | Used. Collection/search/signal keyword groups. |
| `/admin/entities` | `src/app/admin/entities/page.tsx` | `EntityManager` | Used. Entity dictionary, aliases, normalization. |
| `/admin/exclusion-rules` | `src/app/admin/exclusion-rules/page.tsx` | `ExclusionRulesManager` | Used. Exclusion rules and candidate domains. |
| `/admin/newsletter` | `src/app/admin/newsletter/page.tsx`, `src/app/admin/newsletter/actions.ts` | `NewsletterManager` with server actions | Used. Newsletter settings, preview, manual send, history, recipients. |
| `/admin/users` | `src/app/admin/users/page.tsx`, `src/app/admin/users/actions.ts` | `UserManager` with server actions | Used. User approval and role management. |
| `/admin/settings` | `src/app/admin/settings/page.tsx` | `AdminAppearanceSettings`, `HomeSectionsSettings`, `CrawlSettings` | Used. Mixed local appearance, homepage layout, and crawl settings. |
| `/admin/requests` | `src/app/admin/requests/page.tsx` | `RequestsBoard` | Used. Ops requests, announcements, work/handoff board. |
| Admin loading UI | `src/app/admin/loading.tsx` | Loading fallback | Not a route. |

## 2. Admin Menu Structure

### Source Of Truth

| File | Responsibility |
|---|---|
| `src/lib/admin/nav.ts` | Defines `ADMIN_NAV_GROUPS`, `ADMIN_NAV_BOTTOM`, nav item labels, descriptions, icons, and `findAdminNavItem()`. |
| `src/components/admin/AdminSidebar.tsx` | Renders grouped menu, search, active state, collapsible system group, theme toggle, and request-count badge. |

### Current Menu Groups And Items

| Group | Menu item | Route | Actual screen | Mapping |
|---|---|---|---|---|
| 개요 | 대시보드 | `/admin` | `src/app/admin/page.tsx` | Clean, but screen is an operations aggregate. |
| 콘텐츠 | 콘텐츠 관리 | `/admin/contents` | `AdminContentManager` | Clean. |
| 콘텐츠 | 콘텐츠 추가 | `/admin/upload` | `ContentAddTabs` | Clean. |
| 콘텐츠 | 모닝브리핑 | `/admin/briefings` | `BriefingManager` | Clean. |
| 수집 | 소스 관리 | `/admin/sources` | `SourceManager` | Maps, but combines source catalog and crawl controls. |
| 수집 | 크롤링 현황 | `/admin/crawl-logs` | `CrawlLogsTable` | Clean. |
| 수집 | 제외 규칙 | `/admin/exclusion-rules` | `ExclusionRulesManager` | Clean. |
| 분류 엔진 | 카테고리 분류기준 | `/admin/keywords` | `KeywordManager` | Clean, label is narrower than all keyword usage. |
| 분류 엔진 | 수집 키워드 | `/admin/keyword-groups` | `KeywordGroupManager` | Clean, label hides signal/filter responsibilities. |
| 분류 엔진 | 엔티티 사전 | `/admin/entities` | `EntityManager` | Clean. |
| 이슈·인사이트 | 이슈 관리 | `/admin/issues` | `IssueManager` | Clean. |
| 이슈·인사이트 | AI 인사이트 | `/admin/insights` | `src/app/admin/insights/page.tsx` | Maps, but item is too broad. |
| 이슈·인사이트 | 핵심 Insight 검수 | `/admin/key-insights` | `KeyInsightsManager` | Clean. |
| 연동·사용량 | 번역 | `/admin/translation` | `TranslationStatusManager` | Clean. |
| 연동·사용량 | LLM 관리 | `/admin/llm` | `LlmManager` | Clean. |
| 발행 | 뉴스레터 | `/admin/newsletter` | `NewsletterManager` | Clean. |
| 시스템 | 운영 게시판 | `/admin/requests` | `RequestsBoard` | Clean. |
| 시스템 | 사용자 관리 | `/admin/users` | `UserManager` | Clean. |
| 시스템 | 콘텐츠 데이터 관리 | `/admin/content-data` | `AdminContentProcessing`, `AdminDataReset` | Maps, but combines unrelated maintenance actions. |
| 시스템 | 시스템 설정 | `/admin/settings` | Appearance, homepage sections, crawl settings | Maps, but too broad. |

### Menu Gaps And Navigation Issues

| Finding | Evidence | Impact |
|---|---|---|
| `/admin/content-data` is in the system group but not included in auto-open path prefixes | `SYSTEM_PATH_PREFIXES = ['/admin/requests', '/admin/users', '/admin/settings']` in `src/components/admin/AdminSidebar.tsx` | If the system group is collapsed and the user lands directly on `/admin/content-data`, the active item may be hidden until the group is manually opened. |
| Detail route not exposed in menu | `/admin/contents/[id]` has no nav item | Acceptable for a detail route, but it should be linked consistently from content lists. |
| Legacy route not exposed | `/admin/raw` redirects to `/admin/contents` | Good as migration support, but it is a duplicate concept and should eventually be removed after links are verified. |
| Real objects hidden from menu | `ai_reports`, `ai_report_sources`, `competitor_weekly_reports`, `curated_groups`, `curated_companies`, `llm_prompts`, `topic_cover_images`, `content_signals`, `entity_events`, `content_views`, `signup_email_allowlist` | Operators cannot directly inspect or manage several backend objects. |
| Menu groups are feature-oriented, not object-oriented | `AI 인사이트`, `콘텐츠 데이터 관리`, `시스템 설정` | Makes it hard to understand which table/job/status each action controls. |

## 3. Page-Level Responsibility

| Route | Purpose | Main UI components | Main data displayed | Main actions | Related APIs / calls | Related objects and status fields | Responsibility shape |
|---|---|---|---|---|---|---|---|
| `/admin` | Operations dashboard | `AdminTodoBlock`, `AdminOpsSignals`, `AdminContentHealth`, `DashboardCharts`, `AiRefreshButton` | Content counts, source counts, crawl failures, pending users, LLM/translation/TTS usage, issue/entity/insight/report counts, content health | Trigger AI refresh | `POST /api/admin/ai-refresh`; direct Supabase counts | `contents.status`, `crawl_logs.status`, `users.approval_status`, `llm_usage`, `translation_usage`, `tts_usage`, `content_signals` | Mixed overview. |
| `/admin/sources` | Source catalog and crawl operations | `SourceManager`, `SourceImportDialog` | Sources, recent source status, source quality stats | Create/update/delete source, import CSV/text, start crawl, add domain exclusion | Direct `sources` CRUD; `GET /api/admin/source-status`; `GET /api/admin/source-quality`; `POST/GET /api/admin/crawl-now`; `POST /api/admin/sources/import`; `POST /api/admin/exclusion-rules` | `sources.is_active`, `sources.collection_method`, `sources.trust_tier`, `crawl_logs.status`, `exclusion_rules.action` | Mixes source object management and operational jobs. |
| `/admin/crawl-logs` | Crawl execution audit | `CrawlLogsTable` | Last 100 crawl logs, source name/type, count summaries | Inspect logs; table can query related contents by time/source | Server Supabase query; client direct `contents` queries inside table | `crawl_logs.status`, `crawl_logs.error_message`, counts | One object: crawl logs. |
| `/admin/contents` | Content review and moderation | `AdminContentManager` | Content rows with source/category/status/body health/bookmark/thumbnail | Filter, paginate, edit, publish, reject, delete, bulk status/delete, upload cover | Direct `contents` and `sources` Supabase calls; cover upload via `uploadCoverFile()` | `contents.status`, `review_reason`, `body_fetched_at`, `body_len`, `sentiment`, `link_ok`, `thumbnail_fetched_at`, `cluster_checked_at` | Mostly one object, but includes content health and media upload. |
| `/admin/contents/[id]` | Content detail and source preview | `ContentArticleView`, `StatusBadge` | Full content body, report iframe, source metadata, services, keywords | Open source, view signed report URL | Direct admin Supabase query; `getReportSignedUrl()`; `/api/contents/[id]/source` link | `contents.status`, `contents.file_path`, `content_services`, `content_keywords` | One object detail, mostly read-only. |
| `/admin/upload` | Manual ingestion | `ContentAddTabs`, `ReportUploadForm`, `TextPasteForm`, `UrlImportForm` | Upload form, paste form, URL extraction preview | Upload PDF/report, paste text, import URL metadata, optional cover copy, extraction | `POST /api/admin/upload`; storage `reports`; direct `contents` insert; `POST /api/admin/contents/[id]/extract`; `POST /api/admin/paste`; `POST /api/admin/import-url`; `POST /api/admin/cover-from-url` | `contents.status`, `contents.category`, `content_services`, `keywords`, `content_keywords`, storage `reports`, `report-covers` | Mixed ingestion flows for the same `contents` object. |
| `/admin/content-data` | Maintenance/backfill/reset operations | `AdminContentProcessing`, `AdminDataReset` | Job progress for body, signals, canonical URLs, thumbnails, clusters; purge counts | Run backfills, purge crawled articles, purge YouTube content | `POST /api/admin/body-backfill`; `POST /api/admin/signals-backfill`; `GET /api/admin/canonical-backfill`; `POST /api/admin/thumbnail-backfill`; `POST /api/admin/cluster-backfill`; `GET/POST /api/admin/contents/purge`; `GET/POST /api/admin/youtube/purge` | `contents.body_fetched_at`, `body_len`, `content_signals`, `canonical_url`, `thumbnail_fetched_at`, `cluster_id`, `cluster_checked_at` | Highly mixed and operationally risky. |
| `/admin/translation` | Translation provider health | `TranslationStatusManager` | Provider enabled state, key configured state, monthly usage | Enable/disable provider | `GET/POST /api/admin/translation-status` | `translation_settings.enabled`, `translation_usage.chars` | One settings/usage area. |
| `/admin/llm` | LLM provider and routing management | `LlmManager` | Provider cards, monthly usage, models, task routing | Enable/disable provider, run test | `GET/PATCH /api/admin/llm`; `GET /api/admin/llm-test` | `llm_settings.enabled`, `llm_settings.monthly_token_limit`, `llm_usage.tokens`, `llm_models.is_active`, `llm_task_routing.is_active` | Mixes provider settings, usage, and routing. |
| `/admin/briefings` | Morning briefing operations | `BriefingManager` | Briefings, TTS usage, audio/highlights state | Generate TTS, generate highlights, update status | `GET /api/admin/briefings`; `PATCH /api/admin/briefings/[id]`; `POST /api/admin/briefings/[id]/tts`; `POST /api/admin/briefings/[id]/highlights` | `briefings.status`, `briefings.error_reason`, `briefings.audio_url`, `briefings.highlights`, `tts_usage` | One object plus AI/TTS jobs. |
| `/admin/issues` | Issue cluster management | `IssueManager` | Issues, summaries, content counts, match keywords, AI candidate source | Create/edit/delete, publish/archive, rematch contents, generate brief, generate candidates | Direct `issues` and `issue_contents`; `POST /api/admin/issues/[id]/rematch`; `POST /api/admin/issues/[id]/brief`; `POST /api/admin/issues/candidates/generate` | `issues.status`, `issues.source`, `issues.brief`, `issue_contents.source` | One object plus related job actions. |
| `/admin/insights` | AI insight generation and card moderation | Page-local client logic | Insight cards and job controls | Generate industry/company cards, sentiment, LGU impact, YouTube tagging, YouTube summaries, competitor weekly report, publish/archive/delete cards | `GET/POST /api/admin/insights`; `PATCH/DELETE /api/admin/insights/[id]`; `POST /api/admin/sentiment`; `POST /api/admin/lgu-impact`; `POST /api/admin/youtube-tagging`; `POST /api/admin/youtube-summary`; `POST /api/admin/competitor-weekly` | `insight_cards.status`, `contents.sentiment`, `contents.lgu_impact`, `contents.summary_ko`, `competitor_weekly_reports.status` | Mixes many AI jobs and multiple objects. |
| `/admin/key-insights` | Weekly key insight review | `KeyInsightsManager` | Weekly key insight cards | Edit headline/summary/implication/order, feature, publish/reject | `GET /api/admin/key-insights`; `PATCH /api/admin/key-insights/[id]` | `key_insights.status`, `is_featured`, `is_new`, `needs_verify` | One object review queue. |
| `/admin/keywords` | Service classification keywords | `KeywordManager` | Keywords grouped by service | Create/update/delete keyword, mark competitor | Direct `keywords` and `services` Supabase calls | `keywords.is_competitor` | One object. |
| `/admin/keyword-groups` | Collection/filter/signal groups | `KeywordGroupManager` | Keyword groups, patterns, seeds, weights | Create/update/delete group, enable/disable | Direct `keyword_groups` Supabase calls | `keyword_groups.is_active`, `tag_type`, `signal_hint` | One object, but object does several jobs. |
| `/admin/entities` | Entity dictionary and normalization | `EntityManager` | Entities, aliases, services, normalization suggestions | CRUD entity/alias, merge, suggest/apply normalization | Direct `entities`, `entity_aliases`, RPC `merge_entities`; `POST/GET /api/admin/entities/apply-normalization`; `POST /api/admin/entities/suggest-normalization` | `entities.entity_type`, `entities.is_competitor`, `entities.competitor_group`, `content_entities.source` | One core object plus normalization job state. |
| `/admin/exclusion-rules` | Auto-reject/hold rules | `ExclusionRulesManager` | Exclusion rules and candidate domains | Add/update/delete rules, activate/deactivate, ignore candidate | `GET/POST/PATCH/DELETE /api/admin/exclusion-rules`; `GET/POST /api/admin/exclusion-candidates` | `exclusion_rules.action`, `is_active`, `hit_count`, `exclusion_candidate_ignores` | One object plus candidate helper. |
| `/admin/newsletter` | Newsletter publishing | `NewsletterManager` | Settings, preview, issues, recipient status | Save settings, preview HTML, manual send, inspect recipients | Server actions `updateNewsletterSettings`, `sendNewsletterNow`, `getPreviewHtml`; `GET /api/admin/newsletter-recipients` | `newsletter_settings.is_enabled`, `last_sent_on`, `newsletter_issues.status`, `newsletter_recipients.status` | One publishing workflow. |
| `/admin/users` | User approval and roles | `UserManager` | Users, departments, teams, roles, approval status | Approve, reject, promote by email, update role | Server actions `approveUser`, `rejectUser`, `promoteByEmail`, `updateUserRole` | `users.role`, `users.approval_status`, `approved_at`, `approved_by` | One object. |
| `/admin/settings` | Admin-local appearance, home layout, crawl threshold | `AdminAppearanceSettings`, `HomeSectionsSettings`, `CrawlSettings` | Local theme/font/color controls, homepage sections, min body length | Save local appearance, save homepage section order/visibility, save crawl min length | local storage; `GET/PUT /api/admin/homepage`; `GET/PATCH /api/admin/crawl-settings` | `homepage_sections.enabled`, `homepage_sections.sort_order`, `crawl_settings.min_body_length` | Mixed unrelated settings. |
| `/admin/requests` | Operational handoff board | `RequestsBoard` | Requests, announcements, work items | Create item, update status/owner/body/ref | `GET/POST/PATCH /api/admin/requests`; sidebar `GET /api/admin/requests/count`; export `GET /api/admin/worklog/export` exists but is not surfaced here | `ops_requests.post_type`, `status`, `pinned`, `resolved_at` | One operational object. |

## 4. Data Model Inventory

| Object/table/collection | Important fields | Status fields | Timestamps | Related admin screens | Missing admin screen / notes |
|---|---|---|---|---|---|
| `auth.users` | Supabase auth identity, email | Supabase auth state | Supabase-managed | Indirect via `/admin/users` through `public.users` | No direct auth identity screen. |
| `users` | `id`, `email`, `name`, `department`, `team`, `position`, `role`, `onboarding_completed`, `content_filter_mode`, `feed_onboarding_skipped`, `approval_status`, `approved_at`, `approved_by` | `role`, `approval_status`, `onboarding_completed` | `created_at`, `updated_at`, `approved_at` | `/admin/users`, dashboard pending count | Allowlist/admin automation is separate from user manager. |
| `signup_email_allowlist` | `email`, `note`, `is_admin` | none | not consistently updated | None | Missing admin screen for signup allowlist and auto-admin rules. SQL in `docs/sql-handoff/239-*`, `240-*`. |
| `services` | `name`, `description`, `icon`, `order` | none | `created_at` | Indirect in keywords/entities/upload | No admin screen to manage service catalog. |
| `user_services` | `user_id`, `service_id`, `is_pinned` | `is_pinned` | `created_at` | None | User preference/onboarding object hidden from admin. |
| `sources` | `name`, `type`, `url`, `rss_url`, `collection_method`, `trust_tier`, `is_active`, `crawl_interval_minutes`, `last_crawled_at`, `group_name` | `is_active`, `collection_method`, `trust_tier` | `created_at`, `updated_at`, `last_crawled_at` | `/admin/sources`, `/admin/crawl-logs` | Source groups exist in SQL but are not clearly managed in UI. |
| `crawl_logs` | `source_id`, `fetched_count`, `inserted_count`, `duplicate_count`, `held_count`, `error_message`, `started_at`, `finished_at` | `status` = `success|partial|failed` | `started_at`, `finished_at`, `created_at` | `/admin/crawl-logs`, `/admin`, `/admin/sources` | Counts only. No raw item details. |
| Raw collected items | No durable table found | none | none | None | Missing `raw_items` or crawl staging table. Raw feed items are processed directly by `src/lib/crawler/orchestrator.ts`. |
| `contents` | `category`, `source_id`, `title`, `summary_ko`, `body_original`, `body_markdown`, `body_translated_ko`, `original_url`, `canonical_url`, `thumbnail_url`, `file_path`, `title_hash`, `body_hash`, `view_count`, `bookmark_count`, `cluster_id`, `importance_score`, `matched_groups`, `matched_keywords`, `sentiment`, `lgu_impact`, `link_ok`, `body_len` | `status` = `pending|published|rejected`; plus health markers `body_fetched_at`, `signals_classified_at`, `thumbnail_fetched_at`, `cluster_checked_at`, `link_checked_at` | `published_at`, `collected_at`, `created_at`, `updated_at` | `/admin/contents`, `/admin/contents/[id]`, `/admin/upload`, `/admin/content-data`, `/admin/insights` | Main overloaded content object. `schema.sql` currently contains duplicate `cluster_id` and duplicate `contents_status_idx` / `contents_cluster_idx` definitions. |
| `content_services` | `content_id`, `service_id` | none | `created_at` | `/admin/upload`, `/admin/contents/[id]` | No dedicated relationship editor beyond upload/edit flows. |
| `keywords` | `name`, `service_id`, `is_competitor` | `is_competitor` | `created_at` | `/admin/keywords`, `/admin/upload` | Clean admin screen. |
| `content_keywords` | `content_id`, `keyword_id` | none | `created_at` | `/admin/upload`, `/admin/contents/[id]` | No dedicated relationship management. |
| `keyword_groups` | `name`, `kind`, `tag_type`, `include_patterns`, `exclude_patterns`, `weight`, `signal_hint`, `search_seeds`, `is_active` | `is_active` | `created_at`, `updated_at` | `/admin/keyword-groups` | Controls collection, filtering, classification, and signal creation in one object. |
| `content_signals` | `content_id`, `signal_type`, `score`, `source` | `source` = rule/llm-style marker | `created_at` | Dashboard counts, `/admin/content-data` backfill | Missing dedicated signal inspection screen. |
| `youtube_videos` | `video_id`, `source_id`, `title`, `channel_name`, `description`, `thumbnail_url`, `duration_seconds`, `view_count` | none | `published_at`, `collected_at`, `created_at`, `updated_at` | None | Separate legacy video table exists, while current admin purge/tagging/summary operates on `contents.category = '유튜브'`. Duplicate concept. |
| `entities` | `canonical_name`, `entity_type`, `description`, `is_competitor`, `competitor_group`, `service_id`, `mention_count` | `is_competitor` | `created_at`, `updated_at` | `/admin/entities` | Good screen, but related event timeline is hidden. |
| `entity_aliases` | `entity_id`, `alias` | none | `created_at` | `/admin/entities` | Managed in entity screen. |
| `content_entities` | `content_id`, `entity_id`, `source`, `score` | `source` | `created_at` | Indirect in `/admin/entities`, content detail, issue/report generation | No content-entity link inspector. |
| `entity_events` | `entity_id`, `event_date`, `title`, `summary`, `signal_type`, `content_ids`, `generated_at` | `signal_type` | `event_date`, `generated_at`, `created_at` | None | Generated by `/api/admin/entities/[id]/events`; user entity pages consume it. Missing admin screen. |
| `issues` | `title`, `summary`, `match_keywords`, `source`, `brief`, `brief_generated_at`, `brief_model` | `status` = `draft|published|archived` | `created_at`, `updated_at`, `brief_generated_at` | `/admin/issues`, `/admin/key-insights`, `/dashboard/reports/new` | Good screen. |
| `issue_contents` | `issue_id`, `content_id`, `source` | `source` | `created_at` | `/admin/issues`, reports generation | Managed only through issue screen rematch/generation. |
| `insight_cards` | `period_start`, `period_end`, `scope`, `topic`, `headline`, `card_headline`, `implication`, `source_content_ids`, `citations` | `status` = `draft|published|archived` | `generated_at`, `created_at`, `updated_at` | `/admin/insights` | Screen mixes this object with unrelated AI backfills. |
| `key_insights` | `week_of`, `display_order`, `is_featured`, `category`, `headline`, `summary_ko`, `implication`, `source_name`, `source_url`, `is_new`, `needs_verify`, `issue_id`, `related_past` | `status` = `draft|needs_review|published|rejected` | `published_at`, `created_at`, `updated_at` | `/admin/key-insights` | Good object-specific review screen. |
| `ai_reports` | `user_id`, `type`, `title`, `prompt`, `body_md`, `file_path`, `error_message` | `status` = `draft|generating|completed|failed` | `created_at`, `updated_at` | Dashboard count only; user pages `/dashboard/reports*` | Missing admin report/job screen. |
| `ai_report_sources` | `ai_report_id`, `content_id`, `youtube_video_id`, `issue_id` in code path | Constraint in base schema only allows `content_id` or `youtube_video_id` | `created_at` | User report detail | Potential schema drift: `src/app/api/reports/generate/route.ts` inserts `issue_id`, but base `schema.sql` definition does not include `issue_id`. |
| `briefings` | `briefing_date`, `title`, `script`, `source_content_ids`, `audio_url`, `audio_duration_seconds`, `voice`, `error_reason`, `highlights` | `status` = `draft|published|archived|failed` | `generated_at`, `published_at`, `created_at`, `updated_at` | `/admin/briefings` | Good screen. |
| `tts_usage` | `provider`, `period`, `chars` | none | `updated_at` | `/admin/briefings`, `/admin` | Usage only. |
| `translation_settings` | `provider`, `enabled` | `enabled` | `updated_at` | `/admin/translation` | Good screen. |
| `translation_usage` | `provider`, `period`, `chars` | none | `updated_at` | `/admin/translation`, `/admin` | Usage only. |
| `llm_settings` | `provider`, `enabled`, `monthly_token_limit` | `enabled` | none in base schema | `/admin/llm`, `/admin` | Missing `updated_at` in base schema. |
| `llm_usage` | `provider`, `period`, `tokens`, `calls` | none | `updated_at` | `/admin/llm`, `/admin` | Usage only. |
| `llm_models` | `provider`, `model_id`, `label`, `strengths`, `context_tokens`, `is_active` | `is_active` | `created_at` | `/admin/llm` | Displayed, but no full CRUD screen evident. |
| `llm_task_routing` | `task_type`, `priority`, `provider`, `model_id`, `is_active` | `is_active` | none | `/admin/llm` | Routing visible; write surface limited to provider toggles. |
| `llm_prompts` | `key`, `label`, `prompt_text` | none | `updated_at` | None | Missing prompt editor. Used by insight and competitor weekly generators. |
| `topic_cover_images` | `key_type`, `key_ref`, `image_url`, `is_active`, `sort_order` | `is_active` | `created_at` | None | Missing admin screen for generated/fallback cover assets. |
| Storage `reports` | Private report files | storage policies | storage metadata | `/admin/upload`, content detail | No storage browser; accessed through signed URLs. |
| Storage `report-covers` | Public cover images for content | storage policies | storage metadata | `/admin/upload`, `/admin/contents` cover upload | No asset library. |
| Storage `topic-covers` | Public generated fallback covers | storage policies | storage metadata | None | Missing asset management screen. |
| `newsletter_settings` | `is_enabled`, `send_hour_kst`, `send_days`, `card_count`, `subject_tpl`, `last_sent_on` | `is_enabled` | `updated_at`, `last_sent_on` | `/admin/newsletter` | Good screen. |
| `newsletter_issues` | `sent_on`, `subject`, `content_ids`, `recipient_cnt`, `triggered_by` | `status` = `pending|sent|partial|failed` | `created_at` | `/admin/newsletter` | Good screen. |
| `newsletter_recipients` | `issue_id`, `user_id`, `email`, `resend_message_id`, `delivered_at`, `opened_at`, `error` | `status` = `queued|sent|delivered|opened|bounced|failed` | `created_at`, delivery/open timestamps | `/admin/newsletter` recipients modal | Good read screen. |
| `newsletter_subscriptions` | `user_id`, `frequency`, `is_active`, `newsletter_email`, `unsubscribe_token` | `frequency`, `is_active` | `created_at`, `updated_at` | Indirect newsletter dispatch | No admin subscription management per user. |
| `competitor_weekly_reports` | `week_start`, `week_end`, `summary`, `overall_impact`, `emerging_topics`, `sections` | `status` = `draft|published` | `generated_at`, `created_at` | Generation button in `/admin/insights`; user pages consume via query helpers | Missing dedicated report list/review screen. |
| `curated_groups` | `key`, `label`, `kind`, `display_mode`, `sort_order`, `is_active` | `is_active`, `display_mode` | `created_at` | None | Missing admin screen for competitor/watchlist group catalog. |
| `curated_companies` | `name`, `aliases`, `groups`, `is_competitor`, `entity_id`, `role`, `sort_order`, `is_active` | `is_active`, `is_competitor` | `created_at` | None | Missing admin screen; related to entities but separate source of truth. |
| `user_watchlist` | `user_id`, `company`, `entity_id` | none | `created_at` | None | User-side object hidden from admin. |
| `user_preferences` | `user_id`, `keyword_id`, `weight`, `source` | `source` | `created_at`, `updated_at` | None | Missing analytics/preferences admin view. |
| `user_service_prefs` | `user_id`, `service_id`, `weight`, `source` | `source` | `created_at`, `updated_at` | None | Missing analytics/preferences admin view. |
| `content_views` | `user_id`, `content_id`, `viewed_at`, `dwell_seconds` | none | `viewed_at` | None; API `/api/content_views` | Missing engagement analytics screen. |
| `bookmarks` | `user_id`, `content_id`, `youtube_video_id` | none | `created_at` | Dashboard count only | Missing admin engagement screen. |
| `archives`, `archive_items` | Archive name/description, content links, notes, order | none | `created_at`, `updated_at` | None | Missing admin engagement/workflow screen. |
| `ops_requests` | `post_type`, `title`, `body`, `kind`, `owner`, `ref`, `pinned`, `phase`, `seq`, `created_by`, `resolved_at` | `status` = `pending|in_progress|done|blocked` or `active|archived` for announcements | `created_at`, `updated_at`, `resolved_at` | `/admin/requests` | Good screen. Export API exists but is not surfaced in the board UI. |
| `exclusion_rules` | `rule_type`, `value`, `action`, `is_active`, `note`, `hit_count`, `last_hit_at`, `created_by` | `action` = `reject|hold`, `is_active` | `created_at`, `updated_at`, `last_hit_at` | `/admin/exclusion-rules`, `/admin/sources` quick action | Good screen. |
| `exclusion_candidate_ignores` | `domain`, `created_by` | none | `created_at` | `/admin/exclusion-rules` | Helper object only. |
| `homepage_sections` | `section_key`, `enabled`, `sort_order` | `enabled` | `updated_at` | `/admin/settings` | Could move to System Settings as its own item. |
| `crawl_settings` | `min_body_length` | none | `updated_at` | `/admin/settings` | Crawl setting is hidden under broad system settings. |
| Views/RPCs: `trending_keywords`, `trending_issue_articles`, `issue_evidence`, `exclusion_candidates`, `merge_entities`, source quality RPC | Aggregated rows | derived | derived | Used by user pages or admin helper APIs | No admin explorer for derived analytics. |

## 5. API Inventory

### Admin API Routes

Most routes below live under `src/app/api/admin/**/route.ts`. Common behavior: handlers check session and `users.role === 'admin'`; most return JSON `{ error }` with `401/403/400/500` on failure; several routes gracefully return `tableReady: false` or defaults when optional SQL has not been applied.

| Endpoint / method | Purpose | Input parameters | Output shape if inferable | Related page | Related object | Error handling behavior |
|---|---|---|---|---|---|---|
| `POST /api/admin/ai-refresh` | Run admin AI refresh orchestration | optional JSON/body details | AI refresh result counts/errors | `/admin` | issues, insight cards, entity events, key insights | Admin check, JSON error on failure. |
| `POST /api/admin/body-backfill` | Backfill full body extraction in batches | Query `limit`, `from`, `to` | `{ processed, improved, skipped, remaining }` style counts | `/admin/content-data` | `contents.body_*`, `body_len` | Admin check; per-item errors logged/skipped. |
| `POST /api/admin/body-backfill/by-ids` | Backfill selected content IDs | JSON `{ ids }` | Per-ID backfill results | Not directly exposed in current admin page | `contents` | Admin check; validates max count. |
| `GET /api/admin/canonical-backfill` | Normalize canonical URLs and dedupe metadata | Query `limit` | Counts/results | `/admin/content-data` | `contents.canonical_url`, clusters | Admin check; JSON error. |
| `POST /api/admin/signals-backfill` | Populate `content_signals` | Query `limit` | Counts/results | `/admin/content-data` | `content_signals`, `contents.signals_classified_at` | Admin check; JSON error. |
| `POST /api/admin/thumbnail-backfill` | Copy missing OG thumbnails into cover storage | Query `limit` | Counts/results | `/admin/content-data` | `contents.thumbnail_url`, `thumbnail_fetched_at`, `report-covers` | Admin check; JSON error. |
| `POST /api/admin/cluster-backfill` | Compute similar-article clusters | Query `limit` | Counts/results | `/admin/content-data` | `contents.cluster_id`, `cluster_checked_at` | Admin check; JSON error. |
| `GET/POST /api/admin/contents/purge` | Count or delete crawled article data | none | Count on GET; deletion count on POST | `/admin/content-data` | `contents` | Admin check; destructive POST. |
| `GET/POST /api/admin/youtube/purge` | Count or delete YouTube content data | none | Count on GET; deletion count on POST | `/admin/content-data` | `contents.category='유튜브'` | Admin check; destructive POST. |
| `POST /api/admin/upload` | Create signed upload token for report file or cover image | JSON filename/category/contentId/isCover style fields | `{ token, storagePath, path }` style token/path | `/admin/upload` | Storage `reports`, `report-covers` | Admin check; env/storage config errors reported. |
| `POST /api/admin/paste` | Insert manual text content | JSON content form fields, service IDs, keywords, cover URL | Inserted content ID and metadata | `/admin/upload` | `contents`, `content_services`, `keywords`, `content_keywords` | Admin check; validation errors returned in Korean. |
| `POST /api/admin/import-url` | Fetch URL metadata/body preview | JSON `{ url }` | Prefill object: title/body/category/source/thumbnail fields | `/admin/upload` | external URL, `contents` draft input | Admin check; invalid URL/fetch errors returned. |
| `POST /api/admin/cover-from-url` | Server-copy external image to cover storage and update content | JSON `{ contentId, imageUrl }` | `{ publicUrl, storagePath }` style result | `/admin/upload`, `TextPasteForm` | `contents.thumbnail_url`, storage `report-covers` | Admin check; server config and fetch errors handled. |
| `POST /api/admin/contents/[id]/extract` | Extract PDF/report text, translate/summarize, link entities/issues | Route `id` | `{ ok, chars, lang, translated, summarized, entities, issues, reason }` style result | `/admin/upload`, content detail workflows | `contents`, storage `reports`, `content_entities`, `issue_contents` | Admin check; gracefully handles missing body/extraction failure. |
| `GET/POST /api/admin/crawl-now` | Start crawl and poll progress | POST JSON `{ sourceId?, backfillDays? }`; GET `startedAt`, `sourceId?` | Run/progress summary | `/admin/sources` | `sources`, `crawl_logs`, `contents` | Admin check; progress summarized from logs. |
| `GET /api/admin/source-status` | Source status summary from recent logs | none | Map/list of `SourceStatusInfo` | `/admin/sources` | `sources`, `crawl_logs` | Admin check; JSON error. |
| `GET /api/admin/source-quality` | Source quality stats | Query `days` | Map/list of `SourceQualityStat` | `/admin/sources` | source quality RPC, `contents`, `crawl_logs` | Admin check; SQL missing may degrade. |
| `POST /api/admin/sources/import` | Validate/preview/commit source imports | JSON `{ text, format, mode }` | Parsed rows, validation errors, inserted/updated counts | `/admin/sources` | `sources` | Admin check; validation errors returned. |
| `GET/PATCH /api/admin/crawl-settings` | Read/update crawl settings | PATCH JSON `{ min_body_length }` | Settings row or default | `/admin/settings` | `crawl_settings` | Admin check; returns default if table missing. |
| `GET/POST/PATCH/DELETE /api/admin/exclusion-rules` | CRUD exclusion rules | POST/PATCH JSON rule fields; DELETE query `id` | Rule rows / ok | `/admin/exclusion-rules`, `/admin/sources` quick create | `exclusion_rules` | Admin check; returns `tableReady:false` if table missing. |
| `GET/POST /api/admin/exclusion-candidates` | List or ignore noisy domains | GET `days`, `min`; POST `{ domain }` | Candidate rows or ignored ok | `/admin/exclusion-rules` | RPC `exclusion_candidates`, `exclusion_candidate_ignores` | Admin check; graceful empty state if SQL missing. |
| `GET/POST /api/admin/translation-status` | Translation provider status and toggles | POST `{ provider, enabled }` | Providers, settings, usage | `/admin/translation` | `translation_settings`, `translation_usage` | Admin check; provider validation. |
| `GET/PATCH /api/admin/llm` | LLM provider status, usage, routing, toggle | PATCH `{ provider, enabled }` | Providers, models, routing, usage | `/admin/llm` | `llm_settings`, `llm_usage`, `llm_models`, `llm_task_routing` | Admin check; JSON error. |
| `GET /api/admin/llm-test` | Test LLM routing/classification | none | Test result with provider/model | `/admin/llm` | LLM gateway | Admin check; JSON error. |
| `GET /api/admin/briefings` | List briefing status and usage | none | Briefing list plus TTS usage | `/admin/briefings` | `briefings`, `tts_usage` | Admin check; JSON error. |
| `POST /api/admin/briefings/generate` | Generate a briefing manually | JSON generation options | Briefing result | Not visibly wired in `BriefingManager` fetch grep | `briefings` | Admin check; JSON error. |
| `PATCH /api/admin/briefings/[id]` | Update briefing status | Route `id`, JSON `{ status }` | Updated briefing | `/admin/briefings` | `briefings.status`, `published_at` | Admin check; validates status. |
| `POST /api/admin/briefings/[id]/tts` | Generate TTS audio | Route `id` | Audio URL/duration/usage result | `/admin/briefings` | `briefings.audio_url`, `tts_usage` | Admin check; TTS errors reported. |
| `POST /api/admin/briefings/[id]/highlights` | Generate briefing highlights | Route `id` | Highlight result | `/admin/briefings` | `briefings.highlights` | Admin check; JSON error. |
| `POST /api/admin/issues/[id]/rematch` | Rebuild issue-content links | Route `id` | Matched/inserted counts | `/admin/issues` | `issues`, `issue_contents` | Admin check; JSON error. |
| `POST /api/admin/issues/[id]/brief` | Generate issue brief | Route `id` | Brief text/model metadata | `/admin/issues` | `issues.brief` | Admin check; JSON error. |
| `POST /api/admin/issues/candidates/generate` | Generate issue candidates from recent content | JSON `{ days?, max? }` | `{ created, skipped }` style counts | `/admin/issues` | `issues`, `issue_contents` | Admin check; JSON error. |
| `GET/POST /api/admin/insights` | List or generate insight cards | POST `{ days?, scope?, maxCompanies?, maxThemes? }` | `{ cards }` on GET; generation counts/topics on POST | `/admin/insights` | `insight_cards` | Admin check; JSON error. |
| `PATCH/DELETE /api/admin/insights/[id]` | Update or delete insight card | PATCH `{ status }`; route `id` | Updated card or ok | `/admin/insights` | `insight_cards.status` | Admin check; validates status. |
| `POST /api/admin/sentiment` | Backfill content sentiment | JSON `{ days?, max? }` | analyzed/candidate counts | `/admin/insights` | `contents.sentiment` | Admin check; JSON error. |
| `POST /api/admin/lgu-impact` | Backfill LGU impact label | JSON `{ days?, max? }` | analyzed/candidate counts | `/admin/insights` | `contents.lgu_impact` | Admin check; JSON error. |
| `POST /api/admin/youtube-tagging` | Backfill YouTube tags/classification | JSON `{ max? }` | processed counts | `/admin/insights` | YouTube `contents`, tags/entities | Admin check; JSON error. |
| `POST /api/admin/youtube-summary` | Backfill YouTube summaries | JSON `{ max? }` | processed counts | `/admin/insights` | `contents.summary_ko` for YouTube | Admin check; JSON error. |
| `POST /api/admin/competitor-weekly` | Generate weekly competitor report | JSON `{ weekStart? }` | report row/result | `/admin/insights` | `competitor_weekly_reports` | Admin check; generation errors returned. |
| `GET /api/admin/key-insights` | List weekly key insight cards | Query `week_of?` | Week list/cards | `/admin/key-insights` | `key_insights` | Admin check; JSON error. |
| `PATCH /api/admin/key-insights/[id]` | Update key insight card | Route `id`, JSON editable fields/status | Updated card | `/admin/key-insights` | `key_insights.status`, flags/order | Admin check; validates fields. |
| `POST /api/admin/entities/[id]/events` | Generate entity event timeline | Route `id` | Generated events / error reason | No admin screen; user entity page related | `entity_events` | Admin check; JSON error. |
| `POST /api/admin/entities/suggest-normalization` | Ask LLM for entity merge suggestions | JSON `{ entityType? }` | Suggestion groups | `/admin/entities` | `entities`, `entity_aliases` | Admin check; JSON error. |
| `POST/GET /api/admin/entities/apply-normalization` | Start/poll entity merge job | POST `{ groups }`; GET `jobId` | Job progress/result | `/admin/entities` | `entities`, `entity_aliases`, RPC `merge_entities` | Admin check; in-memory job progress, JSON errors. |
| `GET/PUT /api/admin/homepage` | Read/update dashboard homepage sections | PUT `{ sections }` | Section rows | `/admin/settings` | `homepage_sections` | Admin check; JSON error. |
| `GET/POST/PATCH /api/admin/requests` | CRUD operational requests/work/announcements | GET `post_type`, status/owner filters; POST/PATCH item fields | Request rows | `/admin/requests` | `ops_requests` | Admin check; table missing handled with `tableReady:false`. |
| `GET /api/admin/requests/count` | Sidebar open request count | none | `{ count }` | `AdminSidebar` | `ops_requests.status` | Admin check; returns count or error. |
| `GET /api/admin/worklog/export` | Export work requests as markdown | Query filters | Markdown/JSON export | Not surfaced in board UI | `ops_requests` | Admin check; JSON error. |
| `GET /api/admin/newsletter-recipients` | Get recipients for newsletter issue | Query `issueId` | Recipient rows/statuses | `/admin/newsletter` | `newsletter_recipients` | Admin check; 403 "권한 없음" on non-admin. |

### Admin Server Actions

| Function | File | Purpose | Inputs | Output | Related object | Error behavior |
|---|---|---|---|---|---|---|
| `updateNewsletterSettings` | `src/app/admin/newsletter/actions.ts` | Save global newsletter settings | Form/state object | `{ error? }` | `newsletter_settings` | Returns Korean error strings; requires admin. |
| `sendNewsletterNow` | `src/app/admin/newsletter/actions.ts` | Trigger manual newsletter dispatch | none | Dispatch summary or error | `newsletter_settings`, `newsletter_issues`, `newsletter_recipients`, `contents` | Returns partial failure summary from dispatch. |
| `getPreviewHtml` | `src/app/admin/newsletter/actions.ts` | Build newsletter preview HTML | none/settings | HTML string or error | `contents`, email template | Returns error if admin check/settings/content fail. |
| `updateUserRole` | `src/app/admin/users/actions.ts` | Change user role | `userId`, `role` | Updated user or error | `users.role` | Requires admin; refuses invalid state. |
| `promoteByEmail` | `src/app/admin/users/actions.ts` | Promote user by email | `email` | Updated user or error | `users.role` | Requires admin; returns not-found/already-admin errors. |
| `approveUser` | `src/app/admin/users/actions.ts` | Approve pending user | `userId` | Updated user or error | `users.approval_status` | Requires admin. |
| `rejectUser` | `src/app/admin/users/actions.ts` | Reject pending user | `userId` | Updated user or error | `users.approval_status` | Requires admin. |

### Non-Admin APIs That Affect Admin-Managed Objects

| Endpoint / function | Purpose | Related data object | Admin relationship |
|---|---|---|---|
| `/api/cron/crawl` | Scheduled collection | `sources`, `crawl_logs`, `contents`, `content_signals`, `issue_contents` | Operational source/crawl screens observe it. |
| `/api/cron/body-backfill`, `/api/cron/signals-backfill`, `/api/cron/link-health` | Scheduled maintenance | `contents`, `content_signals` | Same jobs also exposed manually in `/admin/content-data`. |
| `/api/cron/ai-refresh`, `/api/cron/key-insights`, `/api/cron/briefing`, `/api/cron/competitor-weekly`, `/api/cron/newsletter` | Scheduled AI/publishing jobs | `issues`, `insight_cards`, `key_insights`, `briefings`, `competitor_weekly_reports`, newsletter tables | Admin screens show or trigger some of these but not all job histories. |
| `/api/reports/generate`, `/api/reports/[id]/refine` | User strategy report generation/refinement | `ai_reports`, `ai_report_sources`, `issues`, `contents` | No admin report management screen. |
| `/api/content_views` | Track user engagement | `content_views`, `contents.view_count` | No admin analytics screen. |
| `/api/webhooks/brevo` | Newsletter delivery/open webhook | `newsletter_recipients` | Feeds newsletter open-rate screen. |
| `/api/newsletter/unsubscribe` | Token-based unsubscribe | `newsletter_subscriptions` | Necessary publishing workflow, not an admin screen. |
| `/api/contents/[id]/body`, `/api/contents/[id]/source` | Content reading/source proxy | `contents`, storage `reports` | Admin detail page links source endpoint. |

## 6. Workflow Mapping

| Pipeline step | Existing code support | Existing admin screen | Missing admin screen | Related data object | Related API/job | Known gaps or inconsistencies |
|---|---|---|---|---|---|---|
| Source registration | Source CRUD, import parser, validation | `/admin/sources` | Source group management | `sources`, `curated_companies` for company-seeded crawling | `POST /api/admin/sources/import` | Source screen also starts crawls and creates exclusion rules; `group_name` is not clearly managed. |
| Crawling/collection | Crawler orchestrator, adapters, schedules, manual trigger, cron | `/admin/sources`, `/admin/crawl-logs` | Crawl job queue/history beyond logs | `sources`, `crawl_logs` | `/api/cron/crawl`, `/api/admin/crawl-now` | Manual and scheduled crawl share logs but no durable job table. |
| Raw item storage | No durable raw item object found | None | Raw collection inbox/staging queue | none; counts only in `crawl_logs` | `src/lib/crawler/orchestrator.ts` | Items move directly into `contents` or are skipped/held; rejected raw data is not inspectable. |
| Filtering/deduplication | URL canonicalization, title/body hash, exclusion rules, quality threshold, cluster backfill | `/admin/exclusion-rules`, `/admin/content-data`, `/admin/settings` for min body length | Dedicated dedupe/reject review queue | `contents`, `exclusion_rules`, `crawl_settings` | `/api/admin/canonical-backfill`, `/api/admin/cluster-backfill`, `/api/admin/exclusion-rules` | Filtering state is spread across status, hashes, canonical URL, cluster fields, and exclusion rules. |
| AI summarization/classification/tagging | LLM gateway, summarize/classify functions, signal classification, sentiment, LGU impact, YouTube jobs | `/admin/llm`, `/admin/content-data`, `/admin/insights`, `/admin/issues` | Unified AI job queue/status screen | `contents.summary_ko`, `content_signals`, `issues`, `content_entities`, `llm_usage` | `/api/admin/signals-backfill`, `/api/admin/sentiment`, `/api/admin/lgu-impact`, `/api/admin/youtube-tagging`, `/api/admin/youtube-summary` | AI job state is mostly field-level markers, not a first-class `ai_jobs` table. |
| Cover image matching/generation | Upload cover, copy OG images, topic cover SQL/table, thumbnail backfill | `/admin/upload`, `/admin/contents`, `/admin/content-data` | Cover asset library and topic cover mapping screen | `contents.thumbnail_url`, `topic_cover_images`, storage `report-covers`, `topic-covers` | `/api/admin/cover-from-url`, `/api/admin/thumbnail-backfill` | `topic_cover_images` exists in SQL but has no admin UI. |
| Content review | Main table with status filters, edit modal, detail route | `/admin/contents`, `/admin/contents/[id]` | Raw-to-content review queue with rejection reasons | `contents.status`, `review_reason` | Direct Supabase CRUD | Review status exists, but raw source/failure context is limited. |
| Publishing/exposure | Published status, homepage sections, newsletter, key insights, briefings, insight cards | `/admin/contents`, `/admin/newsletter`, `/admin/key-insights`, `/admin/briefings`, `/admin/insights`, `/admin/settings` | Unified publishing calendar/status center | `contents.status`, `newsletter_issues.status`, `key_insights.status`, `briefings.status`, `insight_cards.status` | newsletter actions, briefing/key insight APIs, cron jobs | Publishing status is duplicated across many objects with different enums. |
| User engagement analytics | View/bookmark counts, content views, archives, preferences | Dashboard counts only | Analytics/events screen | `content_views`, `bookmarks`, `archives`, `user_preferences`, `user_service_prefs`, `contents.view_count`, `bookmark_count` | `/api/content_views`, feed APIs | Engagement data exists but is not exposed in admin. |
| Strategy report generation | User report pages and APIs | Dashboard count only | Admin report/job management screen | `ai_reports`, `ai_report_sources` | `/api/reports/generate`, `/api/reports/[id]/refine` | `ai_reports` status exists, but admin has no queue/error review. Potential `issue_id` schema drift in `ai_report_sources`. |

## 7. Current Admin Problems

| Problem type | Current problem | Evidence | Recommended direction |
|---|---|---|---|
| Menu item too broad | `AI 인사이트` is a bucket for insight cards, sentiment backfill, LGU impact, YouTube jobs, and competitor weekly reports | `src/app/admin/insights/page.tsx` calls seven different admin APIs | Split insight cards, content AI enrichment jobs, YouTube processing, and competitor weekly reports. |
| Page mixes unrelated responsibilities | `콘텐츠 데이터 관리` mixes body extraction, signals, canonical URLs, thumbnails, clustering, and destructive purges | `src/app/admin/content-data/page.tsx`, `AdminContentProcessing`, `AdminDataReset` | Move destructive reset to a guarded maintenance area; move backfills into AI/job management. |
| Settings mixed | `/admin/settings` combines local appearance settings, homepage section settings, and crawl min body length | `src/app/admin/settings/page.tsx` | Split Appearance, Homepage Layout, and Crawl Settings under System Settings. |
| Source page mixed | `/admin/sources` manages source CRUD, crawl runs, quality metrics, import, and exclusion creation | `SourceManager` | Keep source catalog separate from crawl runs and quality dashboards. |
| Hidden backend objects | `llm_prompts`, `curated_groups`, `curated_companies`, `competitor_weekly_reports`, `topic_cover_images`, `content_signals`, `entity_events`, `content_views`, `signup_email_allowlist` have no first-class admin page | SQL and library references listed above | Add object-based screens or fold into clearly named existing screens. |
| Missing raw queue | No `raw_items` table or raw item review screen | No matching schema object; crawler writes directly to `contents` | Add raw collection object only if operators need source-level rejected item inspection. |
| Status management scattered | `contents.status`, `issues.status`, `insight_cards.status`, `key_insights.status`, `briefings.status`, `newsletter_issues.status`, `ai_reports.status`, `competitor_weekly_reports.status` all differ | Schema enums/text checks | Create status glossary and consistent filters/actions per object. |
| AI jobs not first-class | AI work is represented by field markers or immediate API calls, not job rows | Backfill endpoints return counts, no `ai_jobs` schema found | Add `ai_jobs` or at least a job run log if operators need retries/audits. |
| Duplicate concepts | YouTube appears as `youtube_videos` and as `contents.category='유튜브'` | `youtube_videos` schema plus admin purge/tagging of `contents` | Decide canonical YouTube storage model and mark the other legacy. |
| Duplicate concepts | Report-like content appears as `contents.category='리포트'`, storage `reports`, user `ai_reports`, and `competitor_weekly_reports` | Routes and schemas | Clarify "source report", "strategy report", and "competitor weekly report" in IA labels. |
| Missing links | `curated_companies.entity_id` links to `entities`, but admin entity screen does not manage curated companies | `docs/sql-handoff/253-*`, `EntityManager` | Add related-object links between entities and curated companies. |
| Schema drift risk | `src/app/api/reports/generate/route.ts` inserts `issue_id` into `ai_report_sources`, while base `supabase/schema.sql` definition only has `content_id` and `youtube_video_id` | Code and schema mismatch | Reconcile schema.sql with applied migration or update code after confirming DB. |
| Next.js convention risk | Admin guard is in `src/middleware.ts`, but AGENTS says Next.js 16 requires `src/proxy.ts` | Existing file list | Schedule a separate fix; not part of this audit. |
| Sidebar state mismatch | `/admin/content-data` is omitted from `SYSTEM_PATH_PREFIXES` | `src/components/admin/AdminSidebar.tsx` | Include it when behavior changes are allowed. |
| UX vs backend mismatch | Menu says "카테고리 분류기준" but `keywords` also stores competitor keywords; "수집 키워드" controls signals and exclusion-like patterns too | `KeywordManager`, `KeywordGroupManager` | Rename around objects: Keywords and Keyword Groups/Signals. |
| General logs missing | Errors exist in object-specific fields but there is no central log/error table | `crawl_logs.error_message`, `ai_reports.error_message`, `briefings.error_reason`, `newsletter_recipients.error` | Add Operations Runs/Errors screen if operational debugging grows. |

## 8. Recommended Object-Based Admin IA

This IA is based on objects that already exist in code or SQL. "Required new route" means a route would be needed if this IA is implemented later; no routes were created for this audit.

### Operations Center

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| Operations Dashboard | Aggregate metrics | `/admin` | `src/app/admin/page.tsx`, `AdminOpsSignals`, `AdminContentHealth`, `DashboardCharts` | none | Content status, crawl status, pending users, failed jobs | Metric, current value, change/window, linked object | Trigger AI refresh, jump to filtered lists | Contents, crawl logs, users, LLM, requests |
| Crawl Runs | `crawl_logs` | `/admin/crawl-logs` | `src/app/admin/crawl-logs/page.tsx`, `CrawlLogsTable` | none | `success`, `partial`, `failed` | Started, source, status, fetched, inserted, duplicates, held, error | Inspect related content, retry source crawl | Source, content list |
| Ops Requests | `ops_requests` | `/admin/requests` | `RequestsBoard`, `/api/admin/requests`, `/api/admin/worklog/export` | none | `pending`, `in_progress`, `done`, `blocked`, `active`, `archived` | Type, title, kind, status, owner, ref, updated | Create, assign, change status, export worklog | SQL handoff, commit/ref, owner |
| System Errors | Object-specific error fields | none | `crawl_logs`, `briefings`, `ai_reports`, newsletter recipients | `/admin/errors` | failed/error/non-empty reason | Object type, object ID, status, message, occurred at | Open object, mark resolved where supported | Crawl logs, briefings, reports, newsletter issues |

### Collection Management

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| Sources | `sources` | `/admin/sources` | `SourceManager`, `SourceImportDialog` | none, but remove crawl controls from page later | `is_active`, `type`, `collection_method`, `trust_tier` | Name, type, method, URL/RSS, active, trust, last crawled, group | Create, edit, deactivate, import | Crawl runs, collected contents, exclusion rules |
| Source Quality | Source quality aggregate/RPC | currently embedded in `/admin/sources` | `SourceManager`, `/api/admin/source-quality` | `/admin/source-quality` | active/inactive, high junk ratio, repeated failure | Source, inserted, pending, rejected, duplicate ratio, last error | Open source, create exclusion rule, run crawl | Source, crawl logs, exclusion rules |
| Exclusion Rules | `exclusion_rules`, `exclusion_candidate_ignores` | `/admin/exclusion-rules` | `ExclusionRulesManager`, `/api/admin/exclusion-rules` | none | active/inactive, `reject`, `hold` | Type, value, action, hits, last hit, note | Create, edit, toggle, delete, ignore candidate | Source, contents filtered by domain |
| Crawl Settings | `crawl_settings` | embedded in `/admin/settings` | `CrawlSettings`, `/api/admin/crawl-settings` | `/admin/crawl-settings` | none | Setting, current value, updated | Update min body length | Crawl runs, content health |
| Raw Collection Queue | Missing `raw_items` | none | crawler only | `/admin/raw-items` if object is added | new, duplicate, rejected, held | Source, raw URL, title, reason, collected | Promote, reject, dedupe | Source, content |

### Content Pipeline

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| Content Review | `contents` | `/admin/contents` | `AdminContentManager`, content detail route | none | `pending`, `published`, `rejected`; body/link/thumbnail health | Title, category, source, status, body length, signals, link, collected, published | Edit, publish, reject, delete, bulk actions | Source, services, keywords, entities, issues |
| Content Detail | `contents` | `/admin/contents/[id]` | `src/app/admin/contents/[id]/page.tsx` | none | single object | Title, source, status, body, file/source URL, relations | Edit/status actions should be added here later | Source, services, keywords, entities, issues, report file |
| Manual Ingestion | `contents`, storage | `/admin/upload` | `ContentAddTabs`, `ReportUploadForm`, `TextPasteForm`, `UrlImportForm` | none | draft/published/rejected default | Input type, title, category, source, services, cover | Upload, paste, import URL, extract PDF | Content detail, storage files |
| Content Signals | `content_signals` | embedded in dashboard/content-data | `classify-signals`, `/api/admin/signals-backfill` | `/admin/content-signals` | source, signal_type, missing signals | Content, signal type, score, source, classified at | Reclassify, inspect evidence | Content, keyword groups, issues |
| Cover Assets | `topic_cover_images`, storage `report-covers`, `topic-covers` | partial in upload/content-data | `uploadCoverFile`, `cover-from-image`, `thumbnail-backfill` | `/admin/assets/covers` | active/inactive, missing thumbnail | Key type, key ref, URL, active, usage count | Upload, replace, deactivate, backfill | Content, entity, keyword group |
| Dedupe/Clusters | `contents.cluster_id`, canonical fields | embedded in `/admin/content-data` | `cluster-backfill`, `canonical-backfill` | `/admin/content-clusters` | no cluster, clustered, duplicate candidates | Representative, cluster size, canonical URL, titles, sources | Merge/split/recompute | Content detail |

### AI Job Management

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| LLM Providers | `llm_settings`, `llm_usage` | `/admin/llm` | `LlmManager`, `/api/admin/llm` | none | enabled/disabled, over limit | Provider, enabled, tokens, calls, limit | Toggle, test | Task routing, usage |
| LLM Models & Routing | `llm_models`, `llm_task_routing` | partial in `/admin/llm` | `LlmManager`, SQL handoffs `55`, `238` | `/admin/llm/routing` | active/inactive, task type | Task, priority, provider, model, active | Reorder, activate/deactivate | Provider |
| Prompt Library | `llm_prompts` | none | `docs/sql-handoff/253-*`, `src/lib/insight/generate.ts`, `src/lib/competitor-weekly/generate.ts` | `/admin/prompts` | prompt key, updated recently | Key, label, updated, used by | Edit prompt, preview/test | Insight jobs, competitor reports |
| AI Backfill Jobs | Field-level jobs, proposed `ai_jobs` | scattered in `/admin/content-data` and `/admin/insights` | backfill API routes | `/admin/ai-jobs` | queued/running/succeeded/failed if job table added; otherwise missing field filters | Job type, target count, processed, failed, started, finished | Run, retry, cancel if supported | Contents, signals, insight cards |
| Translation | `translation_settings`, `translation_usage` | `/admin/translation` | `TranslationStatusManager` | none | enabled/disabled | Provider, key configured, enabled, chars used | Toggle, run backfill if exposed | Content body translations |

### Strategy Reports

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| User Strategy Reports | `ai_reports`, `ai_report_sources` | user routes only; admin count on `/admin` | `src/app/api/reports/generate/route.ts`, `src/app/dashboard/reports/**` | `/admin/reports` | `draft`, `generating`, `completed`, `failed` | Title, user, type, status, source count, created, error | Open, inspect sources, retry/refine if allowed | User, contents, issues |
| Report Sources | `ai_report_sources` | user report detail | report detail code | `/admin/reports/[id]/sources` | source type: content/youtube/issue | Report, source type, title, linked object | Add/remove source if supported | Content, issue, YouTube |
| Competitor Weekly Reports | `competitor_weekly_reports` | generation only in `/admin/insights` | `/api/admin/competitor-weekly`, `src/lib/competitor-weekly/**` | `/admin/competitor-weekly` | `draft`, `published`, impact `위기|기회|관망` | Week, status, impact, topics, generated | Generate, publish, unpublish, inspect sections | Curated companies, contents |
| Briefings | `briefings` | `/admin/briefings` | `BriefingManager`, briefing APIs | none | `draft`, `published`, `archived`, `failed` | Date, title, status, audio, highlights, generated | Generate TTS, highlights, publish/archive | Source contents |

### Users & Analytics

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| Users | `users` | `/admin/users` | `UserManager`, `users/actions.ts` | none | `approval_status`, `role`, department | Email, name, department, team, role, approval, created | Approve, reject, promote/demote | Subscriptions, preferences, views |
| Signup Allowlist | `signup_email_allowlist` | none | SQL handoffs `239`, `240` | `/admin/signup-allowlist` | admin/non-admin | Email, is admin, note | Add/remove, toggle admin | User creation flow |
| Engagement Analytics | `content_views`, `bookmarks`, `archives`, `archive_items` | none | `/api/content_views`, dashboard counts | `/admin/analytics/engagement` | date range, content category, user segment | Content, views, dwell, bookmarks, archives | Open content, export | Content, users |
| User Preferences | `user_preferences`, `user_service_prefs`, `user_services`, `user_watchlist` | none | preference APIs/libs | `/admin/analytics/preferences` | source onboarding/behavioral | User, service, keyword, weight, source | Inspect/reset if policy allows | Users, services, keywords, entities |
| Newsletter Subscribers | `newsletter_subscriptions`, `newsletter_recipients` | partial `/admin/newsletter` | `NewsletterManager` | `/admin/newsletter/subscribers` or tab | active/inactive, frequency, recipient status | User, email, active, frequency, last status, opened | Resubscribe/unsubscribe if policy allows | User, newsletter issues |

### System Settings

| Proposed menu item | Responsible object | Existing route | Existing code files | Required new route if missing | Required status filters | Main list columns | Main actions | Related object links |
|---|---|---|---|---|---|---|---|---|
| Homepage Sections | `homepage_sections` | embedded in `/admin/settings` | `HomeSectionsSettings`, `/api/admin/homepage` | `/admin/homepage-sections` | enabled/disabled | Section key, enabled, order, updated | Reorder, enable/disable | Dashboard sections |
| Appearance | local admin preferences | embedded in `/admin/settings` | `AdminAppearanceSettings`, `src/lib/admin/appearance.ts` | keep under `/admin/settings/appearance` if needed | none | Setting, value | Save local preference, reset | None |
| Newsletter Settings | `newsletter_settings` | `/admin/newsletter` | `NewsletterManager`, newsletter actions | none | enabled/disabled | Enabled, send days, hour, card count, subject, last sent | Save, preview, manual send | Newsletter issues |
| Collection Settings | `crawl_settings` | embedded in `/admin/settings` | `CrawlSettings` | `/admin/collection-settings` | none | Setting, value, updated | Save | Crawl quality/content review |
| Service Catalog | `services` | none | used by upload/keywords/entities | `/admin/services` | active if added later | Name, description, icon, order | Edit order/metadata | Users, contents, keywords |
| Curated Companies | `curated_groups`, `curated_companies` | none | `src/lib/entities/major-companies.ts`, `src/lib/competitor-weekly/**`, `src/lib/insight/generate.ts` | `/admin/curated-companies` | active/inactive, competitor/watchlist | Company, aliases, groups, competitor, entity link, role | Add/edit, link entity, reorder | Entities, competitor reports |
