# 지시서 274 — 전략보고서 재설계 (1/3) 백엔드: AI프롬프트 HTML 생성 + 발행 모델

> 설계: `docs/설계-전략보고서-리서치카드형-정기발행.md`. David 결정: 리서치 카드형 + AI프롬프트 HTML + HITL 정기발행. 표지 업로드+AI 둘 다, 본문 생성위주(재생성), 발행 수동 먼저.
> 이건 3분할 중 **1편(백엔드·모델·생성·발행 API)**. UI(275)·어드민 HITL(276)은 후속.

전제: SQL 274(ai_reports 컬럼 + strategy_report 프롬프트) — 미적용 시 graceful. `llm_prompts`(253), `llmComplete('report', …)` 라우팅 존재. 기존 `ai_reports`·`/api/reports/generate`.

---

## 1. 생성 로직 (`src/lib/reports/generate-strategy.ts` 신규)
- 입력: `{ reportId?, type, topic, title?, sourceIssueIds?, contentIds?, promptOverride? }`.
- **컨텍스트 수집**(기존 재사용): 지정 이슈/콘텐츠의 `title`+`summary_ko` 를 모아 user 프롬프트 자료로. (기존 generate route 의 이슈/콘텐츠 집계 헬퍼 재활용 가능.)
- **프롬프트 로드**: `llm_prompts` key `strategy_report`(DB 우선, 미적용/실패 시 코드 상수 폴백). `promptOverride` 있으면 우선.
- **생성**: `llmComplete('report', systemPrompt, userPrompt)` → 결과에서
  - 선두 `<!--SUMMARY: … -->` 파싱 → `summary` (없으면 본문 첫 <p> 텍스트 2~3문장 추출).
  - 나머지 HTML → `body_html`. **코드펜스(```) 제거**, `<script>/<iframe>/on*=`·style 속성 **서버측 1차 제거**(간단 정제; 렌더 시 275에서 2차 sanitize).
- 저장: `body_html`, `summary`, `topic`, `type`, `title`(없으면 topic/LLM 제목), `status='completed'`(=검토 대기 초안), `updated_at`. **published_at 은 건드리지 않음**(발행 별도).
- 실패: `status='failed'`, `error_message`. graceful(42703=컬럼 미적용 시 body_html/summary 등 제외하고 기존 body_md 경로로 폴백하거나 명확한 사유 반환).

## 2. API
- **생성 트리거** `POST /api/reports/generate-strategy` (어드민 인증 게이트 — 263/266 admin 라우트 패턴 `getUser`+`role='admin'`): body `{ type, topic, title?, sourceIssueIds?, contentIds?, promptOverride? }` → 위 로직 실행 → `{ reportId, status }`. 기존 `/api/reports/generate`(markdown) 는 유지(폐기는 275/276 정리 시).
- **발행/해제** `POST /api/reports/[id]/publish` (어드민): body `{ publisher?, published_at?, cover_image_url? }` → `published_at=coalesce(입력, now())`, `publisher=coalesce(입력, 기존/'인사이트 아웃')`, `cover_image_url` 있으면 저장. `unpublish` 는 `published_at=null`.
- **표지 업로드**: 기존 `src/lib/contents/upload-cover.ts` 재사용해 Supabase Storage 업로드 → 반환 URL 을 위 publish/patch 에 전달(실제 업로드 UI 는 276). AI 표지 생성은 후속(이미지 생성 엔드포인트 없음 — 훅 자리만).

## 3. 조회 헬퍼 (`src/lib/reports/query.ts` 신규 또는 확장)
- `getPublishedReports()`: `published_at is not null` 인 것만 `id, title, summary, cover_image_url, publisher, published_at, type` 카드용 조회, `published_at desc`. (275 서비스 리스트가 사용.)
- `getReport(id)`: 상세용 전체(body_html 포함). 42703 graceful(신규 컬럼 없으면 기존 필드만).

## 4. 회귀 가드
- SQL 274 미적용(42703): 신규 컬럼 조회/저장 스킵, 기존 body_md 리포트 흐름 무변.
- 기존 `/api/reports/generate`·`ReportMarkdown` 상세 렌더 유지(275 전까지 공존).
- 무료 LLM 실패: status='failed'+사유, 서비스 미노출(published_at null).
- 어드민 API 인증 게이트 필수(비관리자 403).

## 5. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- generate-strategy 호출 → ai_reports 에 body_html·summary·topic 채워지고 status='completed'.
- publish 호출 → published_at·publisher 설정, getPublishedReports 에 노출.
- 42703 graceful(SQL 전) 확인.
- 커밋: `feat: 전략보고서 백엔드 — AI HTML 생성 + 발행 모델 (지시서 274)`.

## 6. 후속(275/276)
- 275: 서비스 카드형 리스트 + HTML 상세(sanitize 2차).
- 276: 어드민 생성·재생성·표지 업로드/AI·발행자/발행일·발행 워크플로우 + strategy_report 프롬프트 관리 노출.

SQL 별도(274). 이 지시서는 백엔드 생성·발행·조회.
