# Menu Feature Rationale

Audit date: 2026-07-10  
Scope: product decision report for current user-facing Insight Out menus and major features. Application code was not modified.

## Source Status

| Source | Status | Notes |
|---|---|---|
| `PRODUCT_SYSTEM_AUDIT.md` | Not available in repository | Filename search found no `PRODUCT_SYSTEM_AUDIT.md`. Product-route claims below are grounded in current route/menu code and marked as code-confirmed where possible. |
| `AI_TOOLCHAIN_MAP.md` | Read | Used for AI, automation, ranking, crawling, TTS, email, search, and admin-control dependencies. |
| Current route/menu code | Read | Main evidence includes `src/components/dashboard/DashboardHeader.tsx`, `src/app/dashboard/*`, `src/components/analysis/*`, `src/components/entities/*`, `src/components/feed/*`, and related APIs/services. |

## Product Area Taxonomy

| Product area | Definition | Example surfaces |
|---|---|---|
| 발견 | 사용자가 볼 만한 인사이트를 발견하는 영역 | 홈, 추천, 인기, 실시간 급상승, 키워드 |
| 소비 | 콘텐츠를 읽고 이해하는 영역 | 콘텐츠 상세, 요약, 핵심 포인트, 브리핑/TTS |
| 탐색 | 사용자가 직접 찾는 영역 | 검색, 필터, 키워드, 출처별 보기 |
| 개인화 | 사용자 관심사를 반영하는 영역 | 관심 키워드, 관심 기업, 저장, 추천 피드 |
| 고부가 인사이트 | Insight Out만의 차별화 영역 | 전략보고서, 주간 브리핑, 산업 분석, 경쟁사 분석 |
| 피드백/설정 | 사용자의 계정, 피드백, 환경 설정 영역 | 마이페이지, 온보딩, 뉴스레터 설정, 계정/승인 |

## Current Menu Role Classification

| Menu / feature surface | Current route | Role classification | Product stance |
|---|---|---|---|
| 홈 | `/dashboard` | 발견, 개인화, 소비 | Keep. Make it the daily briefing and recommendation entry point. |
| AI 인사이트 | `/dashboard/issues`; `/dashboard/ai-analysis` redirects here | 고부가 인사이트, 발견, 소비 | Keep / rename to `인사이트`. Reduce overloaded subviews. |
| 기업동향 | `/dashboard/entities` | 발견, 탐색, 개인화, 고부가 인사이트 | Keep / rename to `기업·경쟁사`. Strong B2B job with admin data dependency. |
| 콘텐츠 | `/dashboard/contents` | 소비, 탐색 | Keep / rename to `콘텐츠 탐색`. Merge search and YouTube category into it. |
| 전략보고서 | `/dashboard/reports` | 고부가 인사이트 | Keep. Clarify rule-based draft vs LLM refinement. |
| 검색 | `/dashboard/search`; header search | 탐색 | Merge into 콘텐츠 탐색. Not a primary menu. |
| 모닝브리핑 | `/dashboard/briefings`; global floating player | 소비, 고부가 인사이트 | Merge into 홈 unless listening metrics justify a primary menu. |
| 마이페이지 / 설정 | `/dashboard/mypage` | 피드백/설정, 개인화 | Keep outside primary IA as profile/settings utility. |
| 저장 / 보관함 | `/dashboard/mypage#bookmarks`, `/dashboard/mypage#archives`, sidebar sections | 개인화, 소비 | Keep as saved-work surface; consider later split only if usage grows. |
| 온보딩 | `/onboarding`; embedded home keyword picker | 개인화, 피드백/설정 | Merge into one coherent preference setup flow. |
| 헤더 알림 | Global dashboard header | 발견 | Keep lightweight; do not treat as true notification system yet. |
| 로그인 / 승인 대기 | `/login`, `/pending`, `/auth/callback` | 피드백/설정 | Keep outside product IA. |

## Rationale Matrix

### 1. 홈

| Field | Decision |
|---|---|
| 1. Menu name | 홈 |
| 2. Current route | `/dashboard` |
| 3. Current features | 홈 섹션 레이아웃, 오늘 업데이트 카운트, 핵심 Insight 카드, 실시간 급상승 티커, 맞춤 추천 피드, 관심 키워드 선택 유도, 브리핑 진입점 |
| 4. Primary user job | 오늘 봐야 할 시장 변화와 내 업무 관련 콘텐츠를 빠르게 파악한다. |
| 5. Why this menu exists | Insight Out의 첫 화면은 사용자가 직접 모든 콘텐츠를 탐색하기 전에 우선순위를 제시해야 한다. |
| 6. How it works technically | `src/app/dashboard/page.tsx`가 홈 섹션을 렌더링하고, `DashboardHeader`의 `NAV_TABS`가 `/dashboard`를 1차 메뉴로 노출한다. 추천 피드는 `FeedSlot`과 `RecommendedFeed`가 담당하며, 핵심 Insight와 이슈 티커는 별도 컴포넌트가 Supabase 데이터를 조회한다. |
| 7. Data objects used | `homepage_sections`, `contents`, `key_insights`, `issues`, `issue_contents`, `trending_keywords`, `trending_issue_articles`, `user_preferences`, `user_service_prefs`, `services`, `keywords`, `briefings` |
| 8. APIs/services used | `/api/feed/recommended`, `/api/preferences/bootstrap`, `/api/preferences/skip`, `/api/keywords/top`, Supabase queries from home/feed components |
| 9. AI/tools used | Recommendation RPC `get_recommended_feed`, feed blocklist/dedupe, trending issue SQL/rule logic, key insight LLM outputs, briefing LLM/TTS outputs consumed from generated rows |
| 10. Admin dependencies | `/admin/settings`, `/admin/key-insights`, `/admin/briefings`, `/admin/contents`, `/admin/issues`, `/admin/keywords`, `/admin/keyword-groups`, `/admin/llm` |
| 11. Expected user benefit | 사용자는 출근 직후 읽을 것과 들을 것을 바로 선택할 수 있다. |
| 12. Expected business/product effect | 재방문, 첫 화면 체류, 추천 콘텐츠 소비, 브리핑 청취를 늘린다. |
| 13. Metric to validate value | 홈 섹션별 CTR, 추천 피드 클릭률, 브리핑 재생률, 핵심 Insight 클릭률, D1/D7 재방문율 |
| 14. Current problem | 홈이 추천, 트렌드, 브리핑, 핵심 Insight를 동시에 담고 있어 주 역할이 흐려질 수 있다. `AI_TOOLCHAIN_MAP.md` 기준 추천 score/order와 검색/추천 로그도 약하다. |
| 15. Recommendation | keep |
| 16. Priority | P0 |
| 17. Required next action | 홈의 주 메시지를 "오늘의 브리핑 + 맞춤 추천"으로 고정하고 섹션별 노출/클릭 로그 설계를 결정한다. |

### 2. AI 인사이트

| Field | Decision |
|---|---|
| 1. Menu name | AI 인사이트 |
| 2. Current route | `/dashboard/issues`; `/dashboard/ai-analysis` redirects to `/dashboard/issues` |
| 3. Current features | 핵심 Insight, 헤드라인 분석, 뜨는 토픽, 이슈 타임라인, 관계지도, 키워드 분석, 범위 필터, 이슈 상세 |
| 4. Primary user job | AI가 해석한 시장 변화, 이슈, 시사점을 보고 의사결정 근거를 얻는다. |
| 5. Why this menu exists | 단순 뉴스 목록이 아니라 업무 판단에 필요한 해석 레이어를 제공하는 핵심 차별화 메뉴다. |
| 6. How it works technically | `src/app/dashboard/issues/page.tsx`가 `AiInsightsView`와 `AiInsightBoard`를 통해 6개 뷰를 구성한다. `src/components/analysis/AiInsightBoard.tsx`의 탭은 `brief`, `headline`, `trending`, `issues`, `graph`, `keyword`다. |
| 7. Data objects used | `key_insights`, `insight_cards`, `issues`, `issue_contents`, `contents`, `keyword_groups`, `entities`, `entity_signal_summary`, `content_signals`, `user_watchlist` |
| 8. APIs/services used | `/api/key-insights`, direct Supabase queries, `fetchIssueActivity()`, issue/trending helpers |
| 9. AI/tools used | Weekly key insight generator, industry insight card generator, issue candidate generator, issue brief generator, sentiment classifier, LGU impact classifier, entity event generator; no RAG/vector search confirmed |
| 10. Admin dependencies | `/admin/key-insights`, `/admin/insights`, `/admin/issues`, `/admin/entities`, `/admin/keyword-groups`, `/admin/llm`; missing prompt/job review depth from `AI_TOOLCHAIN_MAP.md` |
| 11. Expected user benefit | 사용자는 여러 원문을 직접 조립하지 않고 핵심 변화와 근거 콘텐츠를 한 화면에서 본다. |
| 12. Expected business/product effect | Insight Out의 프리미엄 가치와 내부 확산 이유를 만든다. |
| 13. Metric to validate value | Insight 상세 CTR, 근거 콘텐츠 클릭률, 이슈 상세 진입률, 보고서 생성 전환율, 재방문율 |
| 14. Current problem | "AI 인사이트" 하나에 이슈, 그래프, 키워드, 토픽, 헤드라인 분석이 섞여 책임이 넓다. AI job log와 prompt version admin도 부족하다. |
| 15. Recommendation | keep / rename |
| 16. Priority | P0 |
| 17. Required next action | 메뉴명을 `인사이트`로 단순화하고, 핵심 Insight/이슈/토픽 중심으로 축소하며 관계지도는 기업동향으로 병합할지 결정한다. |

### 3. 기업동향

| Field | Decision |
|---|---|
| 1. Menu name | 기업동향 |
| 2. Current route | `/dashboard/entities` |
| 3. Current features | 주요 기업, 경쟁사 최근 뉴스, 경쟁사 동향분석, 관심업체 설정 진입, 엔티티 상세, 관계 그래프, 경쟁사 주간 리포트 |
| 4. Primary user job | 관심 기업, 고객사, 경쟁사의 움직임을 추적하고 대응 우선순위를 잡는다. |
| 5. Why this menu exists | B2B 서비스 담당자에게 정보의 핵심 단위는 기업과 경쟁사이며, 개인화도 기업 관심사에서 강하게 발생한다. |
| 6. How it works technically | `src/app/dashboard/entities/page.tsx`가 `view=watchlist|competitor|trend`를 읽는다. `EntityTabs`는 주요 기업, 경쟁사 최근 뉴스, 경쟁사 동향분석 탭을 제공한다. 상세/주간 리포트/그룹 route가 하위에 존재한다. |
| 7. Data objects used | `entities`, `entity_aliases`, `content_entities`, `user_watchlist`, `curated_groups`, `curated_companies`, `insight_cards`, `contents`, `competitor_weekly_reports`, `entity_signal_summary`, `entity_events` |
| 8. APIs/services used | Direct Supabase queries, `entity_neighbors`, `entity_pair_contents`, `getCompetitorNewsData()`, `/api/admin/entities/[id]/events` for admin-triggered generation |
| 9. AI/tools used | Company insight card generator, competitor weekly generator, LGU impact classifier, sentiment classifier, entity event generator, entity normalization suggester, rule-based entity linking |
| 10. Admin dependencies | `/admin/entities`, `/admin/insights`, `/admin/llm`; dedicated `curated_groups`, `curated_companies`, competitor weekly review admin is not clearly complete |
| 11. Expected user benefit | 사용자는 내 업무와 관련 있는 기업 변화만 골라 보고 놓친 움직임을 줄인다. |
| 12. Expected business/product effect | 개인화된 업무 적합성을 높여 반복 사용과 보고서 전환을 늘린다. |
| 13. Metric to validate value | 관심기업 등록률, 기업 카드 CTR, 경쟁사 뉴스 클릭률, 주간 리포트 열람률, 관심기업 등록 후 재방문율 |
| 14. Current problem | 사용자 가치가 강하지만 큐레이션 회사/그룹 운영 화면과 경쟁사 리포트 검수 화면이 약하거나 분산되어 있다. |
| 15. Recommendation | keep / rename |
| 16. Priority | P0 |
| 17. Required next action | 메뉴명을 `기업·경쟁사`로 명확히 하고, curated company/group 운영을 `/admin/entities`에 흡수할지 별도 admin으로 만들지 결정한다. |

### 4. 콘텐츠

| Field | Decision |
|---|---|
| 1. Menu name | 콘텐츠 |
| 2. Current route | `/dashboard/contents` |
| 3. Current features | 콘텐츠 목록, 뉴스/유튜브/웹인사이트/리서치 필터, 출처 필터, 발행순/수집순, 카드/목록 보기, 콘텐츠 상세, 원문 보기, PDF 미리보기, YouTube 임베드, 번역 기사 보기, 관련 기사/관련 유튜브, 북마크, 아카이브 |
| 4. Primary user job | 필요한 원문, 요약, 영상, 리포트를 찾아 읽고 근거로 저장한다. |
| 5. Why this menu exists | 모든 인사이트, 보고서, 브리핑의 원천 데이터 저장소이자 검증 가능한 근거 화면이다. |
| 6. How it works technically | `src/app/dashboard/contents/page.tsx`가 URL 쿼리로 category/src/sort/page를 관리한다. 상세는 `src/app/dashboard/contents/[id]/page.tsx`가 콘텐츠 유형에 따라 기사/PDF/YouTube/번역/관련 콘텐츠를 렌더링한다. |
| 7. Data objects used | `contents`, `sources`, `services`, `content_services`, `keywords`, `content_keywords`, `content_entities`, `bookmarks`, `archives`, `archive_items`, `content_views`, storage `reports` |
| 8. APIs/services used | `/api/contents/[id]/body`, `/api/contents/[id]/source`, `/api/contents/[id]/view`, `/api/content-views`, direct Supabase queries, `getRelatedGrouped()`, `getRelatedYoutube()` |
| 9. AI/tools used | RSS/news crawler, YouTube Atom crawler, full-body extractor, translation cascade, LLM summarizer, PDF parser, thumbnail extractor, related-content matching, dedupe/cluster rules |
| 10. Admin dependencies | `/admin/contents`, `/admin/upload`, `/admin/sources`, `/admin/content-data`, `/admin/translation`, `/admin/exclusion-rules`, `/admin/keywords`, `/admin/keyword-groups`, `/admin/entities` |
| 11. Expected user benefit | 사용자는 신뢰 가능한 근거를 직접 확인하고 다시 쓸 자료를 저장한다. |
| 12. Expected business/product effect | 콘텐츠 신뢰도와 재사용성이 올라가며 보고서/인사이트 기능의 기반 품질을 만든다. |
| 13. Metric to validate value | 상세 전환율, 원문 클릭률, 평균 체류시간, 북마크/아카이브 저장률, 관련 콘텐츠 클릭률 |
| 14. Current problem | 검색이 별도 route로 분리되어 있고, 북마크/아카이브 역할 차이가 약하다. PDF OCR, YouTube transcript, search log도 미구현/부분 구현이다. |
| 15. Recommendation | keep / rename |
| 16. Priority | P0 |
| 17. Required next action | `콘텐츠 탐색`으로 확장해 검색·필터·저장 흐름을 통합하고, OCR/YouTube transcript는 명시적으로 후순위 또는 개선 과제로 분리한다. |

### 5. 전략보고서

| Field | Decision |
|---|---|
| 1. Menu name | 전략보고서 |
| 2. Current route | `/dashboard/reports`, `/dashboard/reports/new`, `/dashboard/reports/[id]` |
| 3. Current features | 보고서 목록, 새 보고서 만들기, 유형 선택, 이슈/콘텐츠 선택, 마크다운 초안 생성, 상세 보기, 편집/저장, 상태 변경, AI로 다듬기, 인쇄/PDF |
| 4. Primary user job | 선택한 콘텐츠와 이슈를 업무용 보고서 초안으로 전환한다. |
| 5. Why this menu exists | 정보 소비를 실제 업무 산출물로 연결하는 프리미엄 가치다. |
| 6. How it works technically | `/api/reports/generate`는 선택한 이슈/콘텐츠를 기반으로 규칙 기반 마크다운 초안을 생성한다. `/api/reports/[id]/refine`은 LLM `report` task로 판단/전략 섹션을 보강한다. `ReportEditor`가 편집과 저장을 담당한다. |
| 7. Data objects used | `ai_reports`, `ai_report_sources`, `issues`, `issue_contents`, `contents`, `content_entities` |
| 8. APIs/services used | `/api/reports/generate`, `/api/reports/[id]/refine`, direct Supabase update in report editor |
| 9. AI/tools used | Initial draft is deterministic/rule-based; LLM refinement uses custom LLM router. No RAG/vector search confirmed. |
| 10. Admin dependencies | `/admin/issues`, `/admin/contents`, `/admin/llm`; dedicated report operations/admin route not confirmed |
| 11. Expected user benefit | 사용자는 빈 문서가 아니라 근거가 연결된 보고서 골격에서 시작한다. |
| 12. Expected business/product effect | Insight Out을 정보 포털에서 업무 산출물 도구로 확장한다. |
| 13. Metric to validate value | 보고서 생성 수, 생성 완료율, AI 다듬기 사용률, 편집 저장률, 인쇄/PDF 사용률, 보고서 재방문율 |
| 14. Current problem | 메뉴명은 AI 보고서를 기대하게 하지만 1차 생성은 LLM이 아니다. 보고서 품질/프롬프트/실패를 운영하는 admin도 부족하다. |
| 15. Recommendation | keep / rename |
| 16. Priority | P1 |
| 17. Required next action | "근거 기반 초안 생성 + AI 다듬기"로 포지셔닝을 명확히 하고 report admin/logging 필요성을 결정한다. |

### 6. 검색

| Field | Decision |
|---|---|
| 1. Menu name | 검색 |
| 2. Current route | `/dashboard/search`; header `SearchBar` |
| 3. Current features | 헤더 검색창, 모바일 검색 버튼, 추천 질문 칩, 제목/요약/본문 ILIKE 검색, 회사명 별칭 정규화 |
| 4. Primary user job | 알고 있는 키워드나 회사명으로 콘텐츠를 바로 찾는다. |
| 5. Why this menu exists | 콘텐츠가 늘어날수록 직접 검색은 필수 탐색 유틸리티다. |
| 6. How it works technically | `src/app/dashboard/search/page.tsx`가 `q` 파라미터를 읽고 `contents`를 `title`, `summary_ko`, `body_original` ILIKE 조건으로 조회한다. SQL FTS 인덱스는 존재하지만 현재 UI 주 경로는 ILIKE다. |
| 7. Data objects used | `contents`, `content_keywords`, `content_services`, `keywords`, `services`, dormant `contents.search_vector` |
| 8. APIs/services used | Direct Supabase query; dedicated search API not confirmed |
| 9. AI/tools used | No RAG, embeddings, vector search, or reranking confirmed. Uses alias normalization helper and SQL/ILIKE retrieval. |
| 10. Admin dependencies | `/admin/contents`, `/admin/keywords`, `/admin/entities`; missing search analytics/admin |
| 11. Expected user benefit | 사용자는 메뉴와 필터를 돌아다니지 않고 필요한 자료에 바로 접근한다. |
| 12. Expected business/product effect | 콘텐츠 재사용과 보고서 근거 선택 전환을 높인다. |
| 13. Metric to validate value | 검색 실행 수, 결과 클릭률, 무결과율, 검색 후 상세 진입률, 검색 후 보고서 소스 선택률 |
| 14. Current problem | `AI_TOOLCHAIN_MAP.md` 기준 search log가 확인되지 않는다. 검색 품질을 개선할 데이터 루프가 없다. |
| 15. Recommendation | merge |
| 16. Priority | P1 |
| 17. Required next action | `/dashboard/search`를 콘텐츠 탐색의 상단 검색으로 통합하고 `search_logs` 및 무결과 분석을 만들지 결정한다. |

### 7. 모닝브리핑

| Field | Decision |
|---|---|
| 1. Menu name | 모닝브리핑 / 지난 브리핑 |
| 2. Current route | `/dashboard/briefings`; global `FloatingBriefingMini` in dashboard layout |
| 3. Current features | 플로팅 미니 플레이어, 재생/일시정지, 처음으로, 스크립트 보기, 지난 브리핑 목록, 브리핑별 플레이어 |
| 4. Primary user job | 읽지 않고 오늘의 핵심 산업 흐름을 듣거나 스크립트로 확인한다. |
| 5. Why this menu exists | 출근/이동 중 소비 가능한 리텐션 기능이며 콘텐츠 탐색 전 요약 진입점이다. |
| 6. How it works technically | `FloatingBriefingMini`와 `MorningBriefingPlayer`가 `briefings`의 published/archived row와 `audio_url`을 사용한다. 브리핑 생성은 admin/cron의 `generateBriefing()`과 TTS API가 담당한다. |
| 7. Data objects used | `briefings`, `briefing_articles`, `briefing_highlights`, `contents`, `tts_usage`, Supabase storage bucket `briefings` |
| 8. APIs/services used | Direct Supabase queries for user playback, `/api/cron/briefing`, `/api/admin/briefings/generate`, `/api/admin/briefings/[id]/tts`, `/api/admin/briefings/[id]/highlights` |
| 9. AI/tools used | Briefing LLM generator, highlight LLM generator, Google Cloud TTS, briefing candidate ranking rules |
| 10. Admin dependencies | `/admin/briefings`, `/admin/llm`; missing stronger TTS queue/retry/cost monitoring |
| 11. Expected user benefit | 사용자는 긴 콘텐츠를 열기 전에 핵심 흐름을 빠르게 이해한다. |
| 12. Expected business/product effect | 습관 형성, 반복 방문, 콘텐츠 소비 확대를 만든다. |
| 13. Metric to validate value | 플레이어 노출 대비 재생률, 완청률, 스크립트 열람률, 브리핑 후 콘텐츠 클릭률, 지난 브리핑 재생률 |
| 14. Current problem | 전역 플로팅으로 강하게 노출되지만 1차 NAV에는 없다. 콘텐츠별 TTS가 아니라 브리핑 전용 TTS라는 범위도 명확해야 한다. |
| 15. Recommendation | merge / hide as primary |
| 16. Priority | P1 |
| 17. Required next action | 홈 핵심 섹션으로 유지하고, 재생 데이터가 충분히 높을 때만 별도 1차 메뉴 승격을 검토한다. |

### 8. 마이페이지 / 설정

| Field | Decision |
|---|---|
| 1. Menu name | 마이페이지 |
| 2. Current route | `/dashboard/mypage` |
| 3. Current features | 프로필 저장, 콘텐츠 보기 방식, 담당 서비스, 관심업체, 뉴스레터 설정, 북마크/아카이브 목록, 아카이브 이메일 발송 |
| 4. Primary user job | 내 프로필, 관심사, 수신 설정, 저장 자료를 관리한다. |
| 5. Why this menu exists | 개인화와 재방문 흐름은 사용자가 직접 제어할 수 있어야 한다. |
| 6. How it works technically | `src/app/dashboard/mypage/page.tsx`가 클라이언트에서 Supabase CRUD를 수행한다. `WatchlistManager`는 `user_watchlist`와 curated company 데이터를 사용하고, archive email은 Brevo API route를 사용한다. |
| 7. Data objects used | `users`, `services`, `user_services`, `user_watchlist`, `curated_groups`, `curated_companies`, `newsletter_subscriptions`, `bookmarks`, `archives`, `archive_items` |
| 8. APIs/services used | Direct Supabase CRUD, `/api/email/send-archive` |
| 9. AI/tools used | No direct AI. Archive email uses Brevo; preferences feed recommendation consumes saved data. |
| 10. Admin dependencies | `/admin/users`, `/admin/newsletter`, `/admin/entities`; missing preference/engagement analytics admin |
| 11. Expected user benefit | 사용자는 Insight Out을 자기 업무 맥락에 맞게 조정한다. |
| 12. Expected business/product effect | 개인화 데이터 축적과 저장 행동을 통해 재방문 가능성이 높아진다. |
| 13. Metric to validate value | 프로필 완성률, 담당 서비스 설정률, 관심업체 등록률, 뉴스레터 opt-in, 설정 변경 후 추천 클릭률 |
| 14. Current problem | 설정, 개인화, 저장함, 이메일 발송이 한 화면에 과밀하다. 관심업체 설정은 기업동향과도 중복된다. |
| 15. Recommendation | keep |
| 16. Priority | P2 |
| 17. Required next action | 마이페이지는 계정/설정 중심으로 유지하고, 저장함이나 관심기업이 독립 메뉴가 될 만큼 사용되는지 측정한다. |

### 9. 저장 / 보관함

| Field | Decision |
|---|---|
| 1. Menu name | 저장 / 보관함 |
| 2. Current route | `/dashboard/mypage#bookmarks`, `/dashboard/mypage#archives`; dashboard sidebar sections |
| 3. Current features | 콘텐츠 북마크, 아카이브 담기, 아카이브 목록, 최근 아카이빙 콘텐츠 사이드바, 내 북마크 사이드바, 아카이브 이메일 발송 |
| 4. Primary user job | 다시 볼 콘텐츠와 업무 공유용 자료를 모아둔다. |
| 5. Why this menu exists | 사용자가 소비한 정보를 나중에 다시 쓰거나 공유하는 업무 루프가 필요하다. |
| 6. How it works technically | `BookmarkButton`, `ArchiveButton`, `Sidebar`, `mypage`가 `bookmarks`, `archives`, `archive_items`를 조회/수정한다. 이메일 발송은 `/api/email/send-archive`가 Brevo를 사용한다. |
| 7. Data objects used | `bookmarks`, `archives`, `archive_items`, `contents`, `users` |
| 8. APIs/services used | Direct Supabase CRUD, `/api/email/send-archive` |
| 9. AI/tools used | No direct AI. Email sending uses Brevo. |
| 10. Admin dependencies | `/admin/users`, `/admin/contents`; email provider health under newsletter/email ops |
| 11. Expected user benefit | 사용자는 자료를 잃지 않고 보고서/공유 작업에 재사용한다. |
| 12. Expected business/product effect | 콘텐츠 재사용률과 보고서 전환 가능성을 높인다. |
| 13. Metric to validate value | 북마크 저장률, 아카이브 저장률, 저장 후 재방문률, 아카이브 이메일 발송률 |
| 14. Current problem | 북마크와 아카이브의 차이가 UI/제품 언어상 약하다. |
| 15. Recommendation | merge |
| 16. Priority | P2 |
| 17. Required next action | 북마크는 "빠른 저장", 아카이브는 "묶음/공유"로 정의하고 화면 문구와 진입점을 정리한다. |

### 10. 온보딩 / 개인화 설정

| Field | Decision |
|---|---|
| 1. Menu name | 온보딩 |
| 2. Current route | `/onboarding`; embedded keyword picker in `/dashboard` feed area |
| 3. Current features | 프로필 입력, 담당 서비스 선택, 뉴스레터 설정, 추천 키워드 선택, 추천 설정 건너뛰기 |
| 4. Primary user job | 처음 사용 시 내 업무 맥락을 입력해 추천과 기업동향을 맞춘다. |
| 5. Why this menu exists | 초기 선호 데이터가 없으면 추천 피드와 기업 기반 개인화 가치가 약해진다. |
| 6. How it works technically | `/onboarding`은 `users`, `user_services`, `newsletter_subscriptions`를 저장한다. 홈의 `OnboardingKeywordPicker`는 `/api/preferences/bootstrap`, `/api/preferences/skip`, `/api/keywords/top`와 `user_preferences`, `user_service_prefs`를 사용한다. |
| 7. Data objects used | `users`, `user_services`, `newsletter_subscriptions`, `user_preferences`, `user_service_prefs`, `keywords`, `services` |
| 8. APIs/services used | `/api/preferences/bootstrap`, `/api/preferences/skip`, `/api/keywords/top`, direct Supabase |
| 9. AI/tools used | No direct AI. Recommendation RPC consumes saved preferences. |
| 10. Admin dependencies | `/admin/users`, `/admin/keywords`, `/admin/keyword-groups`, `/admin/newsletter` |
| 11. Expected user benefit | 사용자는 처음부터 관련도 높은 콘텐츠를 받는다. |
| 12. Expected business/product effect | Activation과 추천 클릭률을 높인다. |
| 13. Metric to validate value | 온보딩 완료율, 키워드 선택률, skip rate, 첫 추천 클릭률, 담당 서비스 설정률 |
| 14. Current problem | 프로필 온보딩과 홈 피드 온보딩이 분리되어 사용자가 설정을 두 번 하는 구조다. |
| 15. Recommendation | merge |
| 16. Priority | P1 |
| 17. Required next action | 첫 온보딩에서 담당 서비스, 키워드, 관심기업, 뉴스레터를 어느 순서로 받을지 단일 흐름을 설계한다. |

### 11. 헤더 알림 / 최근 콘텐츠

| Field | Decision |
|---|---|
| 1. Menu name | 헤더 알림 |
| 2. Current route | Global dashboard header |
| 3. Current features | 최근 콘텐츠 드롭다운, unread badge, localStorage 기반 read 처리, 오늘 업데이트 카운트 |
| 4. Primary user job | 새로 들어온 콘텐츠를 빠르게 확인한다. |
| 5. Why this menu exists | 매번 목록을 열지 않아도 최근 업데이트를 발견하게 하는 가벼운 리텐션 장치다. |
| 6. How it works technically | `DashboardHeader`가 `contents` 최신 published row를 조회하고, read 상태는 `localStorage` key `io:read-notifications`로 관리한다. 별도 notification table은 확인되지 않는다. |
| 7. Data objects used | `contents`; client `localStorage` |
| 8. APIs/services used | Direct Supabase queries |
| 9. AI/tools used | No direct AI. Content supply depends on crawler/summarizer pipeline. |
| 10. Admin dependencies | `/admin/contents`, `/admin/sources`, `/admin/crawl-logs` |
| 11. Expected user benefit | 사용자는 방금 업데이트된 자료를 놓치지 않는다. |
| 12. Expected business/product effect | 최신 콘텐츠 클릭과 재방문을 늘린다. |
| 13. Metric to validate value | 알림 드롭다운 오픈율, 알림 클릭률, unread 클릭 전환율 |
| 14. Current problem | 현재는 진짜 notification object가 아니라 최신 콘텐츠 목록이다. 서버 로그나 사용자별 알림 상태가 없다. |
| 15. Recommendation | rename / keep lightweight |
| 16. Priority | P2 |
| 17. Required next action | 이 기능을 "최근 콘텐츠"로 명확히 두거나, 실제 notification object를 만들지 결정한다. |

## Supporting Route Ownership

| Route | Current purpose | Role | Recommendation |
|---|---|---|---|
| `/dashboard/contents/[id]` | 콘텐츠 상세, 원문/PDF/YouTube/번역/관련 콘텐츠/저장 액션 | 소비 | 콘텐츠 탐색 하위로 유지 |
| `/dashboard/issues/[id]` | 이슈 상세, 근거 콘텐츠, 유사 이슈, 관련 토픽 | 소비, 고부가 인사이트 | 인사이트 하위로 유지 |
| `/dashboard/topics/[topic]` | 토픽별 관련 콘텐츠 목록 | 탐색, 발견 | 콘텐츠/인사이트 공통 탐색 route로 유지 |
| `/dashboard/trending` | 실시간 급상승 전체 순위 | 발견 | 홈 티커의 상세 route로 유지 |
| `/dashboard/entities/[id]` | 엔티티 상세, 콘텐츠, 이슈, 관련 엔티티, 이벤트 타임라인 | 탐색, 소비 | 기업·경쟁사 하위로 유지 |
| `/dashboard/entities/competitor-news` | 경쟁사 최근 뉴스 전체보기 | 발견, 탐색 | 기업·경쟁사 하위로 유지 |
| `/dashboard/entities/major/[group]` | 주요 기업 그룹 전체보기 | 발견, 탐색 | 기업·경쟁사 하위로 유지 |
| `/dashboard/entities/competitor-weekly/[week]` | 경쟁사 주간 리포트 상세 | 고부가 인사이트, 소비 | 기업·경쟁사 하위로 유지 |
| `/dashboard/insights/[id]` | 인사이트 카드 상세 | 고부가 인사이트, 소비 | 인사이트 하위로 유지 |
| `/dashboard/youtube` | `/dashboard/contents?category=유튜브` redirect | 탐색 | 별도 메뉴로 노출하지 말고 콘텐츠 category link로 흡수 |
| `/login`, `/pending`, `/auth/callback` | 인증/승인 흐름 | 피드백/설정 | 제품 IA에서 제외 |

## Cross-Feature Product Problems

| Problem | Evidence | Product impact | Recommended decision |
|---|---|---|---|
| AI 인사이트 범위가 넓다 | `AiInsightBoard` has 6 tabs: 핵심 Insight, 헤드라인 분석, 뜨는 토픽, 이슈 타임라인, 관계지도, 키워드 분석 | 사용자가 메뉴에서 무엇을 해야 하는지 흐려진다. | 인사이트는 핵심/이슈/토픽 중심으로 줄이고 그래프는 기업·경쟁사로 이동. |
| 개인화 설정이 분산되어 있다 | `/onboarding`, home `OnboardingKeywordPicker`, `/dashboard/mypage`, `WatchlistManager` | 초기 설정과 재설정 위치가 중복된다. | 온보딩, 마이페이지, 기업동향 설정 책임을 명확히 분리. |
| 큐레이션 데이터 운영 화면이 약하다 | `curated_groups`, `curated_companies` are used by user UI; dedicated admin not confirmed | 주요 기업 UI 품질이 운영자 수동 DB 작업에 의존할 수 있다. | curated company admin을 만들거나 `/admin/entities`에 흡수. |
| 전략보고서의 AI 기대치가 불명확하다 | `/api/reports/generate` is deterministic; `/refine` uses LLM | 사용자가 완성형 AI 보고서를 기대하면 실망 가능성이 있다. | "근거 기반 초안 + AI 다듬기"로 포지셔닝. |
| 검색 분석 루프가 없다 | `AI_TOOLCHAIN_MAP.md` reports no confirmed `search_logs` | 어떤 정보 수요가 실패하는지 알 수 없다. | search log and no-result analytics 추가 여부 결정. |
| 브리핑은 강하게 노출되지만 IA 위치가 애매하다 | global `FloatingBriefingMini` exists; primary nav does not include briefing | 핵심 기능인지 실험 기능인지 모호하다. | 홈의 retention feature로 명확히 묶고 listening metric으로 판단. |
| 북마크와 아카이브 개념이 겹친다 | detail pages expose both `BookmarkButton` and `ArchiveButton`; mypage shows both | 저장 행동이 분산된다. | 북마크=빠른 저장, 아카이브=묶음/공유로 정의. |
| AI 운영 관측성이 부족하다 | `AI_TOOLCHAIN_MAP.md` identifies missing durable AI job logs and prompt admin | 실패한 인사이트/브리핑/보고서 원인을 운영자가 추적하기 어렵다. | AI job ledger and prompt template admin을 P0로 계획. |
| RAG/vector capability는 구현되지 않았다 | `AI_TOOLCHAIN_MAP.md` says RAG, embeddings, vector search, reranking not confirmed | 제품 메시지에서 "RAG 기반" 등으로 말하면 코드 근거와 불일치한다. | 검색 로그와 FTS 품질을 먼저 측정한 뒤 semantic search 도입 판단. |

## Simplified User-Facing IA Proposal

Primary menus should stay at five or fewer. The six product areas above are capabilities, not all primary menus. `피드백/설정` should remain outside the primary navigation as profile/account/support surfaces.

| Proposed menu | User job | Included current features | Removed/merged features | Data dependencies | Tool dependencies | Admin dependencies | Success metric |
|---|---|---|---|---|---|---|---|
| 홈 | 오늘의 핵심 흐름을 1분 안에 파악한다. | Current `/dashboard`, 핵심 Insight 3카드, 실시간 급상승, 브리핑 플레이어, 추천 피드 preview, 최근 업데이트 진입 | `/dashboard/briefings`는 홈 하위 detail; 헤더 알림은 "최근 콘텐츠" 유틸로 유지 | `homepage_sections`, `key_insights`, `briefings`, `contents`, `issues`, `user_preferences` | LLM key insights, briefing LLM/TTS, feed ranking RPC, trending rules | `/admin/settings`, `/admin/key-insights`, `/admin/briefings`, `/admin/issues`, `/admin/contents` | 첫 화면 CTR, 브리핑 재생률, 추천 피드 클릭률, D1/D7 재방문율 |
| 인사이트 | AI가 해석한 이슈와 시사점을 본다. | Current AI 인사이트, 핵심 Insight archive, 이슈 타임라인, 뜨는 토픽, 이슈 상세, 헤드라인 분석 | 관계지도는 기업·경쟁사로 이동; 키워드 분석은 콘텐츠 탐색/인사이트 보조로 축소 | `key_insights`, `insight_cards`, `issues`, `issue_contents`, `contents`, `keyword_groups`, `content_signals` | LLM insight generation, issue candidate/brief generation, sentiment/impact classifiers | `/admin/key-insights`, `/admin/insights`, `/admin/issues`, `/admin/llm`; AI job/prompt admin needed | Insight 상세 CTR, 근거 클릭률, 보고서 생성 전환율 |
| 기업·경쟁사 | 내 관심 기업과 경쟁사 변화를 추적한다. | 주요 기업, 경쟁사 최근 뉴스, 경쟁사 동향분석, 엔티티 상세, 관계지도, 관심업체 설정 진입, 경쟁사 주간 리포트 | 마이페이지 관심기업 설정은 여기로 연결; relation graph moved from AI 인사이트 | `entities`, `entity_aliases`, `content_entities`, `user_watchlist`, `curated_groups`, `curated_companies`, `competitor_weekly_reports`, `entity_events` | Company insight LLM, LGU impact classifier, competitor weekly LLM, graph RPC, entity normalization | `/admin/entities`, `/admin/insights`; curated company and competitor weekly admin needed | 관심기업 등록률, 기업 카드 CTR, 경쟁사 리포트 열람률 |
| 콘텐츠 탐색 | 원문, 요약, 영상, 리포트를 찾아 읽고 저장한다. | 콘텐츠 목록/detail, 통합 검색, 토픽 페이지, 유튜브 category, 원문/PDF/YouTube, 북마크, 아카이브, 최근 본 항목 | `/dashboard/search` is merged; `/dashboard/youtube` redirect only; saved surfaces stay as utility anchors | `contents`, `sources`, `services`, `keywords`, `content_*`, `bookmarks`, `archives`, `content_views` | Crawler, summarization, translation, PDF extraction, related matching, link/thumbnail tools, ILIKE/FTS search | `/admin/contents`, `/admin/upload`, `/admin/sources`, `/admin/content-data`, `/admin/translation`, `/admin/exclusion-rules` | 검색 결과 CTR, 상세 체류, 저장률, 원문 클릭률 |
| 보고서 | 선택한 근거를 업무 보고서 초안으로 바꾼다. | 전략보고서 list/new/detail/edit/refine/print | Entry points from 인사이트 and 콘텐츠 remain; "AI report" expectation is clarified | `ai_reports`, `ai_report_sources`, `issues`, `contents`, `content_entities` | Rule-based draft assembler, LLM refine | `/admin/issues`, `/admin/contents`, `/admin/llm`; report job/log admin optional | 보고서 생성 수, AI 다듬기 사용률, 저장/인쇄 완료율 |

## Keep / Merge / Hide / Remove Summary

| Current surface | Recommendation | Reason |
|---|---|---|
| 홈 | Keep | Main activation and retention surface. |
| AI 인사이트 | Keep / rename | Core premium value, but the scope must narrow. |
| 기업동향 | Keep / rename | Strong B2B job; rename to `기업·경쟁사` for clarity. |
| 콘텐츠 | Keep / rename | Core evidence and consumption layer; search should merge here. |
| 전략보고서 | Keep | Differentiated work-output flow. |
| 검색 | Merge | Cross-cutting behavior inside 콘텐츠 탐색. |
| 모닝브리핑 | Merge / hide as primary | 소비와 고부가 인사이트 기능이지만 홈 아래에 두고, 사용량이 높을 때만 1차 메뉴 승격을 검토한다. |
| 마이페이지 | Keep as utility | Profile/preferences belong behind user avatar, not primary IA. |
| 저장 / 보관함 | Merge | Keep under 콘텐츠/마이페이지 until usage proves a separate menu. |
| `/dashboard/youtube` | Hide / redirect only | Duplicates 콘텐츠 category route. |
| 온보딩 keyword picker | Merge | Two onboarding layers create unclear responsibility. |
| 헤더 알림 | Rename / keep lightweight | Current behavior is recent-content dropdown, not full notification system. |
