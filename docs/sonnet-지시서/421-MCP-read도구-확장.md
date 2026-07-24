# 지시서 421 — MCP read 도구 확장 (분석 산출물 전체 개방)

> 작성: 플래너(Opus) · 2026-07-24 · 사내 에이전트(Copilot Studio) 연동 — read 표면 확대
> 근거: `src/lib/mcp/tools/read.ts` 패턴 + 각 데이터 테이블·발행게이트 조사(origin/main)
> 협업 루프: 검증용 브랜치 `agent/421-mcp-read-expand`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 421 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
사내 에이전트가 원문(콘텐츠·이슈·기업)만 보던 걸 넘어 **분석 산출물 전체**(AI 리포트·경쟁사 주간·데일리 인사이트·모닝브리핑·엔티티 이벤트·기업 문서) + **콘텐츠 리치 메타데이터**를 읽게 read 도구를 추가한다. **전부 발행분만·안전 필드만.**

---

## 1. 🔴 공통 안전 규칙 (모든 신규 도구에 필수)
1. **인증·스코프**: 각 콜백 첫 줄 `const g = guard(extra); if (g.err) return g.err` (기존 `read.ts:38` 패턴). 전부 **`read` 스코프**로 충분(신규 스코프 안 만듦).
2. **🔴 발행 필터를 쿼리에 직접**: read 도구는 `createAdminClient()`(service_role)라 **RLS를 우회**한다. 발행 조건을 쿼리에 안 걸면 **초안까지 다 샌다.** 아래 §3 게이트표 그대로 적용.
3. **PII·내부 필드 제외**: §3 제외표 준수. 특히 `ai_reports.user_id`·`prompt`, `*.source_content_ids`·`error_reason`·`model`·내부 심사/해시/타임스탬프.
4. **출력**: 기존처럼 **text**(`ok()`, `dbError()`, `contentLine()` 스타일). JSON 아님.
5. **재사용**: 발행 조회 lib가 있으면 그걸 쓰되 **admin 클라이언트를 인자로 주입**(아래 명시).

## 2. 구현

### 2.1 기존 `content_get`·`content_search` 메타데이터 확장 (`read.ts`)
- `content_get` select에 **`sentiment`(논조)·`lgu_impact`(위기/기회/관망)·`matched_keywords`** 추가해 출력에 포함.
- (선택) `content_entities`→`entities.canonical_name`, `content_signals`(signal_type/score) 조인 노출.
- **`status='published'` 필터 유지.** 제외: `review_reason`·`*_hash`·`search_vector`·`link_*`·`*_fetched_at`.

### 2.2 신규 모듈 `src/lib/mcp/tools/read-analytics.ts` → `registerAnalyticsReadTools(server)`
read.ts 골격(`registerTool(name,{title,description,inputSchema},cb)`)을 그대로 복제. 아래 도구들 등록:

**(a) `report_list` / `report_get` — 발행 AI 리포트**
- lib 재사용: `@/lib/reports/query` `getPublishedReports(admin)` / `getReport(admin, id)`.
- 게이트: **`published_at IS NOT NULL`**. `report_get`은 조회 후 `published_at` null이면 "미발행"으로 반려(상세페이지 275 원칙).
- 필드: id, title(stripLlmArtifacts), summary, type, publisher, published_at, topic, 본문(body_md/html), keywords. **제외: user_id, prompt, status(draft), error_message, file_path.**

**(b) `competitor_weekly_list` / `competitor_weekly_get` — 경쟁사 주간**
- lib 재사용: `@/lib/competitor-weekly/query` `getPublishedCompetitorWeeklyReports(admin, limit)` / `getCompetitorWeeklyReportByWeek(admin, week)`.
- 게이트: **`status='published'`**(lib 내장). 42P01(테이블 없음) graceful → "데이터 없음".
- 필드: week_start/end, summary, overall_impact, emerging_topics, sections(moves/impact/implication/citations…). 근거 content_id는 `content_get`으로 연결 가능함을 description에 안내. **제외: draft.**

**(c) `daily_insight_list` / `daily_insight_get` — 데일리 인사이트**
- 전용 lib 없음 → 쿼리 직접(`daily_insights`). 게이트: **`status='published'` AND `needs_review=false`**(QA 미완 제외).
- 필드: day_of, category, headline, summary_ko, market_trend, competitor_trend, implication, why_it_matters, implication_lenses(jsonb), next_steps, source_articles. **제외: display_order, needs_review 내부값.**

**(d) `briefing_list` / `briefing_get` — 모닝브리핑**
- 전용 lib 없음 → 쿼리 직접(`briefings`). 게이트: **`status IN ('published','archived')`**.
- 필드: id, briefing_date, title, script, audio_url, audio_duration_seconds, highlights(jsonb [{content_id,insight}]). **제외: error_reason, source_content_ids, voice(선택).**

**(e) `entity_events` — 엔티티 이벤트 타임라인 (위기/기회)**
- ⚠️ **발행 게이트 컬럼 없음.** 안전성은 "published contents에서만 생성"에 의존(delete-insert로 최신본만). → **`entity_id` 지정 조회로만** 열고(전건 덤프 금지), description에 "발행 기사 기반 확정 이벤트"라고 명시.
- 쿼리 직접(`entity_events`, `.eq('entity_id', id).order('event_date', desc)`). 필드: event_date, signal_type, headline, detail, **biz_impact, biz_impact_reason**, citations(content_id[]). **제외: model, source_content_ids.**
- 참고: `keywords/detail.ts`의 `KeywordEvent` 정제 형태.

**(f) `company_document_list` / `company_document_get` — 기업 문서/DART**
- lib 재사용: `@/lib/company-docs/query` `getPublishedCompanyDocuments({supabase:admin, entityId, docType, limit})`.
- 게이트: **`review_status='none'`**(lib 내장) + `access_scope='public'`(비-public 존재 시 제외).
- 필드: content_id, title, summary_ko, original_url, published_on, entityName, doc_type, is_official, dart_rcept_no. **제외: review_status≠none, ingest_status, version_group_id/prev_content_id, access_scope≠public.**

### 2.3 등록 (`src/app/api/mcp/route.ts`)
- `registerAnalyticsReadTools(server)`를 `registerReadTools(server)` 옆에 추가 호출.
- 서버 버전 문자열(`serverInfo.version`) 갱신은 선택(예: '421').

## 3. 게이트·제외 요약 (그대로 지킬 것)
| 데이터 | 테이블 | 발행 게이트 | 주요 제외(PII/내부) |
|---|---|---|---|
| AI 리포트 | ai_reports | `published_at IS NOT NULL` | user_id·prompt·status(draft)·error_message·file_path |
| 경쟁사 주간 | competitor_weekly_reports | `status='published'` | draft |
| 데일리 인사이트 | daily_insights | `status='published'` + `needs_review=false` | display_order |
| 모닝브리핑 | briefings | `status IN ('published','archived')` | error_reason·source_content_ids |
| 엔티티 이벤트 | entity_events | (컬럼 없음 → entity_id 지정만) | model·source_content_ids |
| 기업문서 | company_documents | `review_status='none'` + `access_scope='public'` | ingest_status·version 내부·비-public |
| 콘텐츠 메타 | contents | `status='published'`(유지) | review_reason·hash·search_vector·link_*·*_fetched_at |

- **key_insights(폐기)·keyword_insight_cache(저가치)는 도구화 제외.**

## 4. 하지 말 것
- **초안·미발행·검토대기 노출 금지**(§3 게이트를 쿼리에서 직접).
- 제외 필드(§3) 출력 금지 — 특히 `user_id`·`prompt`·`source_content_ids`·`model`.
- write/ops/reports 도구·인증·스코프 로직 무수정(read 추가만).
- 새 스코프 만들지 않기(`read`로 귀속). `insights` 스코프 부활 금지.
- 파이프라인·생성 로직 무관.

## 5. 회귀 가드
1. 기존 4개 read 도구(content_search·content_get·issue_list·entity_list) 동작 그대로.
2. 신규 도구가 **발행분만** 반환(초안 0건 — 각 게이트 확인).
3. `report_get`이 미발행 id에 "미발행" 반려.
4. entity_events가 entity_id 지정으로만 조회(전건 덤프 없음).
5. 제외 필드가 응답에 안 나온다(user_id·prompt·source_content_ids·model 등 grep).
6. read 스코프 토큰으로 신규 도구 호출 가능, 스코프 없으면 forbidden.
7. content_get에 sentiment·lgu_impact·matched_keywords 추가 노출.

## 6. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
ls src/lib/mcp/tools/read-analytics.ts
grep -n "registerAnalyticsReadTools" src/app/api/mcp/route.ts src/lib/mcp/tools/read-analytics.ts
grep -nE "published_at.*is.*null|status.*published|needs_review|review_status|access_scope" src/lib/mcp/tools/read-analytics.ts   # 게이트 확인
grep -nE "user_id|prompt|source_content_ids|\.model" src/lib/mcp/tools/read-analytics.ts && echo "⚠️ 제외 필드 노출 의심 — 확인" || echo "OK"
grep -n "sentiment\|lgu_impact\|matched_keywords" src/lib/mcp/tools/read.ts   # content 메타 확장
git diff --stat origin/main
```
**라이브(토큰으로 MCP 호출 — David/외부접근 환경)**
- [ ] report_list/competitor_weekly/daily_insight/briefing/entity_events/company_document 각 응답
- [ ] 발행분만, 초안 안 나옴
- [ ] content_get에 논조·LGU임팩트 노출

## 7. 커밋
브랜치 `agent/421-mcp-read-expand` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/mcp/tools/read-analytics.ts`(신규) · `read.ts`(content 메타 확장) · `app/api/mcp/route.ts`(등록) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: MCP read 도구 확장 — 리포트·경쟁사주간·데일리·브리핑·이벤트·기업문서 (421)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| 각 도구 발행 게이트 쿼리 직접(RLS 미의존) 확인 | |
| 제외 필드(user_id·prompt·source_content_ids·model) 미노출 | |
| 재사용 lib(reports/competitor-weekly/company-docs)에 admin 주입 | |
| entity_events entity_id 지정 조회만 | |
| daily_insights needs_review=false 병행 | |

## 8. 다음
- 사내 에이전트에서 확장 도구 활용(Copilot Studio) — David PoC.
- (선택) 응답을 구조화(JSON) 원하면 별건.
