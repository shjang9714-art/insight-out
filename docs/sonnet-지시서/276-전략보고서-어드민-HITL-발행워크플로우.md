# 지시서 276 — 전략보고서 재설계 (3/3) 어드민: HITL 생성·재생성·표지·발행 워크플로우

> 설계: `docs/설계-전략보고서-리서치카드형-정기발행.md`. 274(백엔드)·275(서비스 UI) 후속. 관리자가 **주제 선택 → AI HTML 생성 → 검토·재생성 → 표지·발행자·발행일 → 발행**을 수행하는 human-in-the-loop 정기 발행 관리 화면.
>
> **증보(2026-07-11, Opus 재현검증 후)**: nav 등록 누락·표지 헬퍼 오용 위험·근거 미적재·§5 미존재 화면 전제를 보완. 아래 §0 참조.
>
> 전제: 274 API(`/api/reports/generate-strategy`, `/api/reports/[id]/publish`) — **재현검증으로 계약 확인 완료**(§0.2). 275 커밋됨(미배포, 276과 동반 배포).
>
> **동반 배포**: 275와 한 쌍. 275 단독 배포 시 `dashboard/reports/new`로 만든 보고서가 즉시 404가 되는 과도기가 생기므로, §6 정리를 포함한 276과 **함께 배포**한다.
>
> 대상: `src/app/admin/reports/*`(신규), `src/lib/admin/nav.ts`, `src/lib/reports/generate-strategy.ts`(근거 적재), 기존 `dashboard/reports/new` 정리.

---

## 0. 증보 요약 (구현 전 반드시 읽을 것)

### 0.1 이번에 바뀐 지시
1. **nav 등록 필수** — `/admin/reports`를 `src/lib/admin/nav.ts`에 추가하지 않으면 사이드바에서 도달 불가(원 지시서 누락).
2. **표지는 `uploadCoverFile()` 사용** — `uploadCover()`는 **`contents.thumbnail_url`에 쓴다**(ai_reports 아님). 보고서에 쓰면 **무관한 contents 행을 오염**시킨다. §3 참조.
3. **근거(출처) 적재 추가** — 현재 `generate-strategy`는 `ai_report_sources`에 아무것도 쓰지 않아 275 상세의 근거 블록이 항상 빈다. 선택 소스를 적재하도록 보완한다. §2.3 + **SQL 276 필요**.
4. **§5(프롬프트 관리) 삭제** — `/admin/prompts`가 아직 없다(Phase 3 항목). 이 지시서 범위에서 제외, 후속(§9)으로 이관.

### 0.2 검증된 전제 API 계약 (그대로 신뢰해도 됨)
- `POST /api/reports/generate-strategy` — body `{ reportId?, type, topic, title?, sourceIssueIds?, contentIds?, promptOverride? }`. `reportId` 있으면 **재생성(update)**, 없으면 신규(insert). 어드민 전용. `type`·`topic` 필수 검증.
- `POST /api/reports/[id]/publish` — body `{ action?: 'publish'|'unpublish', publisher?, published_at?, cover_image_url? }`. 기본 publish, `publisher` 기본 `'인사이트 아웃'`, `published_at` 기본 now. 어드민 전용. 274 미적용 시 409.

---

## 1. 어드민 보고서 관리 화면 (`/admin/reports`)
- **인증 게이트**: 기존 어드민 라우트 패턴대로 각 라우트/액션에서 `users.role === 'admin'` **직접 재확인**(미들웨어 의존 금지).
- **nav 등록(필수)**: `src/lib/admin/nav.ts`의 **인사이트·리포트 그룹**에 `전략보고서 관리` → `/admin/reports` 항목 추가(Phase 1에서 nav.ts가 그룹·라벨 단일 소스).
- 목록: **전체**(초안·생성중·완료·실패·발행) 상태 배지 + `published_at` 표시. 필터(발행/미발행).
- 각 행 액션: 미리보기 / 재생성 / 표지 / 발행·해제 / 삭제.
- **미리보기**: 서비스 상세(`dashboard/reports/[id]`)는 275에서 미발행이면 404다. 따라서 어드민 미리보기는 **어드민 화면 내부에서** `body_html`을 렌더한다(`sanitizeReportHtml` 재사용 — `src/lib/reports/sanitize-html.ts`). 서비스 라우트를 재사용하지 말 것.

## 2. 생성 (HITL)
### 2.1 새 보고서 폼
- `type`(시장동향·경쟁사분석·키워드분석·서비스리포트·자유주제) + `topic`(필수) + `title`(선택) + (선택) 소스 이슈/콘텐츠 선택 + (선택) 프롬프트 오버라이드.
- "생성" → `POST /api/reports/generate-strategy` → 초안(미발행). 생성 중 상태 표시.

### 2.2 재생성
- 같은 API에 **`reportId` 전달** → `body_html` 갱신(update 경로). 편집은 최소(원하면 원본 HTML 미세수정 textarea — 선택 구현).

### 2.3 근거(출처) 적재 — **신규**
- 현행 `src/lib/reports/generate-strategy.ts`는 `ai_reports`만 insert/update하고 **`ai_report_sources`에 쓰지 않는다** → 275 상세의 근거 블록이 항상 빔.
- 보완: 생성·재생성 시 전달된 `contentIds` / `sourceIssueIds`를 `ai_report_sources`에 적재한다.
  - 콘텐츠 행: `{ ai_report_id, content_id }`
  - 이슈 행: `{ ai_report_id, issue_id }`
  - **재생성 시**: 해당 `ai_report_id`의 기존 소스 행을 먼저 삭제 후 재적재(중복 방지, 유니크 인덱스와 정합).
  - 적재 실패는 **보고서 생성 자체를 깨지 않게** try/catch + 로깅(graceful). 단 조용한 실패가 반복되지 않도록 어드민 응답에 `sourcesSaved` 카운트를 포함.
- **SQL 276 전제**(§2.4). 미적용(42703/CHECK 위반) 시에도 보고서 생성은 성공해야 한다.

### 2.4 DB / SQL — **있음**
- `docs/sql-handoff/276-ai_report_sources-정합.sql` (수희 핸드오프, 멱등).
- 내용: `issue_id` 컬럼 추가 + CHECK를 3항(content/youtube/issue 중 정확히 하나)으로 확장 + 이슈 유니크 인덱스.
- 사유: 기존 `schema.sql`은 `issue_id`가 없고 CHECK가 content/youtube 중 하나를 강제 → 이슈 출처 행이 **CHECK 위반으로 저장 실패**해 왔다(구 `/api/reports/generate`가 에러를 삼킴).
- **`supabase/schema.sql`도 같이 갱신**해 드리프트를 해소할 것(어드민감사 §7 리스크 항목).

## 3. 표지 (업로드 + AI 훅)
- **업로드**: `src/lib/contents/upload-cover.ts`의 **`uploadCoverFile()`을 사용한다**(업로드만 수행, DB 미기록).
  - ⚠️ **`uploadCover()`를 쓰지 말 것** — 그 함수는 `contents.thumbnail_url`을 갱신한다. 보고서는 `ai_reports.cover_image_url`이라 **엉뚱한 contents 행이 오염**된다.
  - `uploadCoverFile(supabase, <reportId>, file, ext)` → `report-covers/{reportId}.{ext}`에 업로드되고 public URL(캐시버스터 `?v=` 포함) 반환. (`/api/admin/upload`의 파라미터명이 `contentId`지만 **파일명 용도**라 report id를 넣어도 무해.)
  - 반환 URL을 `POST /api/reports/[id]/publish`의 **`cover_image_url`**로 전달해 저장(발행 전 저장이 필요하면 별도 PATCH 추가).
- **AI 생성(나노바나나)**: 버튼 자리만 배치하고 **비활성 + "준비 중" 툴팁**(엔드포인트 미구현). 후속에 연결.
- 이미지 타입·용량 제한은 기존 업로드 유틸 규칙 준수.

## 4. 발행 워크플로우
- 발행 폼: `publisher`(기본 '인사이트 아웃', 편집 가능) + `published_at`(기본 now, 조정 가능) + cover 확인.
- "발행" → `POST /api/reports/[id]/publish` → `published_at` 설정 → 서비스 카드 노출(275).
- "발행 해제" → `{ action: 'unpublish' }` → `published_at=null`(서비스에서 숨김).

## 5. (삭제됨 — 프롬프트 관리)
> 원 §5(어드민 프롬프트 관리에서 `strategy_report` 편집)는 **`/admin/prompts` 화면이 아직 없어** 이 지시서 범위에서 제외한다. 어드민 Phase 3 "프롬프트 라이브러리" 독립 슬라이스로 이관(§9).

## 6. 기존 정리 (275와 동반 배포의 핵심)
- **`dashboard/reports/new` 제거(또는 어드민 전용 이동)** — 서비스에서 사용자가 보고서를 생성하지 않는다. 275에서 진입 CTA는 이미 제거됐고 라우트만 살아 있어, 직접 URL 접근 시 생성 후 **즉시 상세 404**가 되는 막다른 길이 남아 있다. 이번에 반드시 정리.
- `ReportEditor.tsx`(구 유저 편집기)도 미사용화되면 함께 정리.
- 구 `/api/reports/generate`(markdown)는 `dashboard/reports/new`가 유일 사용처 → new 제거 시 함께 제거(다른 참조 없음 확인 후).

## 7. 회귀 가드
- 어드민 외 접근 차단(화면·생성·발행 API 모두 role 재확인).
- **275와 동반 배포** — 276 없이 275만 나가면 `reports/new` 막다른 길.
- 표지 미설정·요약 미생성이어도 **발행 가능**(카드 폴백 275).
- **SQL 276 미적용 상태에서도 보고서 생성·발행은 성공**해야 함(근거 적재만 graceful 실패).
- 근거 적재는 재생성 시 **기존 행 삭제 후 재적재**(유니크 인덱스 충돌 방지).
- 삭제는 확인 후. Storage cover는 남아도 무해(선택 정리).
- 어드민 미리보기에도 **`sanitizeReportHtml` 적용**(살균 우회 금지).

## 8. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 어드민: 생성 → 초안 미리보기 → 재생성 → 표지 업로드 → 발행자/발행일 → 발행 → **서비스 카드 노출**.
- 발행 해제 → 서비스에서 숨김.
- **근거**: 소스 이슈·콘텐츠를 선택해 생성 → 서비스 상세의 "근거" 블록에 실제로 표시되는지 확인(SQL 276 적용 후).
- **표지**: 업로드 후 `ai_reports.cover_image_url`이 갱신되고 **`contents` 테이블은 건드려지지 않았는지** 확인.
- `dashboard/reports/new` 제거 후 서비스에 죽은 링크·404 경로가 없는지 확인.
- 비관리자 접근 차단.
- 커밋: `feat: 전략보고서 어드민 HITL 발행 워크플로우 (지시서 276)`.

## 9. 후속
- **프롬프트 라이브러리**(`/admin/prompts`, `llm_prompts`) — 어드민 Phase 3 독립 슬라이스. `strategy_report` 편집·한글 강제 안내.
- AI 표지 생성(나노바나나) 파이프라인 연결.
- PDF 첫 페이지 표지 자동추출(`docs/설계-PDF표지-자동추출-커버소스-우선순위.md`)을 `ai_reports.cover_image_url`에도 확장.
- 스케줄 자동 초안(정기 주제 로테이션 → 어드민 승인).

**SQL 있음** — `docs/sql-handoff/276-ai_report_sources-정합.sql`(수희). 이 지시서는 어드민 생성·표지·발행 HITL + 근거 적재.
