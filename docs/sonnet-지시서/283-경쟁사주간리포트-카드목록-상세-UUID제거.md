# 지시서 283 — 경쟁사 주간 리포트: 카드형 목록 + 상세 진입 + 인라인 UUID 제거 + 탭 라벨

> 작성: Opus(플래너) · 2026-07-11 · 근거: David 요청 — "리포트 형태로 눌렀을 때 상세 글이 보이게", "탭 이름을 경쟁사 주간리포트로", 그리고 스크린샷에서 발견된 **본문 UUID 노출 버그**.
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋".
> 전제: 261 SQL 적용됨(완료). **SQL 없음.**
> 형제 슬라이스: 284(어드민 발행 스케줄) — 독립, 순서 무관.

---

## 0. 한 줄

경쟁사 주간 리포트를 탭에 통째로 펼치던 것을 **카드 목록 → 상세 진입** 구조로 바꾸고, 본문에 그대로 노출되던 **원본 UUID를 제거**하며, 탭 이름을 **"경쟁사 주간리포트"**로 바꾼다.

---

## 1. 현행 진단 (검증된 코드 사실)

- **탭 라벨**: `src/components/entities/EntityTabs.tsx:9`
  `{ id: 'trend', label: '경쟁사 동향분석', href: '/dashboard/entities?view=trend' }`
- **탭 렌더**: `src/app/dashboard/entities/page.tsx` — trend 탭에서 `getLatestPublishedCompetitorWeeklyReport()` + `getCompetitorWeeklyTimeline()`을 호출해 `CompetitorWeeklyReport`를 **인라인으로 전부 펼침**(최신 1건만, 과거 리포트 열람 경로 없음).
- **상세 페이지는 이미 있음**: `src/app/dashboard/entities/competitor-weekly/[week]/page.tsx` — `params: { week }`, `getCompetitorWeeklyReportByWeek(supabase, week)`, 없으면 `notFound()`. **재사용한다(새로 만들지 말 것).**
- **query**: `src/lib/competitor-weekly/query.ts` — `getLatestPublishedCompetitorWeeklyReport` / `getCompetitorWeeklyReportByWeek` / `getCompetitorWeeklyTimeline`. → **N건 목록 함수가 없다(신규 필요).**
- **출처는 이미 잘 나온다**: `CompetitorWeeklyReport.tsx`가 `section.citations`(`{content_id, quote}`)를 `/dashboard/contents/{content_id}` 링크 칩(인용문 표시)으로 렌더 중.
- **UUID 노출 버그 원인**: `src/lib/competitor-weekly/generate.ts:69` 프롬프트가
  *"moves: … 각 서술 끝에 근거 `[content_id]`"* 라고 지시 → LLM이 **서술문 안에 UUID를 박아 넣음** → 렌더러가 `section.moves` 텍스트를 그대로 출력해 화면에 `[0122e121-0bbe-…]`가 노출된다.
  같은 프롬프트가 `citations` 배열(:73)도 따로 받으므로 **인라인 UUID는 순수 노이즈**(출처는 칩으로 이미 표시됨).

---

## 2. DB / SQL

**없음.** (261 적용 완료.)

---

## 3. 구현

### 3-1. 탭 라벨 (1줄)
- `src/components/entities/EntityTabs.tsx:9` → `label: '경쟁사 주간리포트'`. `id`·`href`(`view=trend`)는 **변경 금지**(기존 링크·쿼리 호환).

### 3-2. 인라인 UUID 제거 — **두 군데 다 해야 함**
과거에 생성된 리포트에도 UUID가 이미 저장돼 있으므로, 프롬프트만 고치면 기존 리포트는 계속 깨져 보인다.

1. **프롬프트 정리** (`src/lib/competitor-weekly/generate.ts:69`)
   - `moves` 지시에서 `각 서술 끝에 근거 [content_id]` 문구를 **제거**한다. 근거는 `citations` 배열로만 받는다(:73 유지).
   - `implication` 등 다른 서술 필드에도 id를 넣으라는 지시가 있으면 같이 제거.
2. **렌더 시 스트립(과거 데이터 호환)** — 표시 직전에 UUID 패턴을 제거하는 순수 함수를 두고 서술 텍스트에 적용:
   ```ts
   // src/lib/competitor-weekly/strip-citations.ts (신규)
   const INLINE_ID = /\s*\[[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\]/g
   /** LLM이 서술문에 박아 넣은 [content_id] 마커 제거(출처는 citations 칩으로 표시됨) */
   export function stripInlineCitations(text: string): string {
     return text.replace(INLINE_ID, '').replace(/\s+([.,·])/g, '$1').replace(/\s{2,}/g, ' ').trim()
   }
   ```
   - `CompetitorWeeklyReport.tsx`에서 `section.moves`·`section.implication`·`summary` 출력 시 적용.
   - **UUID만** 지우고 문장은 건드리지 않는다(구두점 앞 공백 정리 정도만).
   - 유닛 성격 확인: 마커가 없는 문장은 그대로여야 한다(멱등).

### 3-3. 카드형 목록 (탭) — 최근 N건
- **query 신규**: `getPublishedCompetitorWeeklyReports(supabase, limit = 12)`
  - `competitor_weekly_reports`에서 `status='published'`, `week_start desc`, limit.
  - 카드에 필요한 필드만: `id, week_start, week_end, summary, overall_impact, emerging_topics`.
  - 기존 함수들과 같은 graceful 패턴(테이블 미적용/에러 시 `[]`).
- **카드 컴포넌트**: `src/components/entities/CompetitorWeeklyCard.tsx`(신규)
  - 표시: 기간(`YYYY.MM.DD ~ MM.DD`) + `overall_impact` 배지(위기/기회/관망) + `summary` 2줄 클램프 + `emerging_topics` 해시태그 칩(최대 3개).
  - 클릭 → `/dashboard/entities/competitor-weekly/{week_start}` (상세, 기존 라우트).
  - 톤: 275 `ReportCard`·기존 콘텐츠 카드와 시각 일관(라운드·보더·호버).
- **탭 교체** (`src/app/dashboard/entities/page.tsx`, trend 탭)
  - 기존: 최신 1건 `CompetitorWeeklyReport` **인라인 전개** → **제거**.
  - 신규: `getPublishedCompetitorWeeklyReports()` 결과를 **카드 그리드**(모바일 1열 / sm 2열 / lg 3열)로.
  - `CompetitorWeeklyTimeline`(위협·기회 레이더)은 **탭에 유지**한다(리포트 목록 위 또는 아래). 없애지 말 것.
  - 빈 상태: "발행된 주간 리포트가 아직 없습니다."
- **상세 페이지**: 기존 `[week]/page.tsx` 그대로 사용. 여기서 `CompetitorWeeklyReport` 전체 렌더(3-2 스트립 적용). 뒤로가기 링크가 `?view=trend`로 돌아오게 확인.

---

## 4. 회귀 가드

- **`EntityTabs`의 `id`/`href`(`view=trend`)는 유지** — 라벨만 변경. 기존 링크·북마크가 깨지면 안 됨.
- 상세 라우트(`competitor-weekly/[week]`)는 **신규 생성 금지**, 기존 것 재사용.
- **초안(draft) 리포트는 서비스에 노출 금지** — 목록·상세 모두 `status='published'`만. (어드민은 초안 확인 가능 — 현행 유지.)
- `CompetitorWeeklyTimeline` 제거 금지.
- 스트립 함수는 **UUID 마커만** 제거. 정상 대괄호 표현(예: `[LG U+]`)을 지우면 안 됨 → 정규식이 UUID 형태에만 매칭하는지 확인.
- 리포트 0건·섹션 0개·citations 0건에서 크래시 없음.

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 탭 이름이 "경쟁사 주간리포트"로 보이고, `?view=trend` 링크가 그대로 동작.
- 탭에 **카드 목록**이 뜨고, 카드 클릭 → 해당 주 상세로 이동.
- 상세·카드 어디에도 **`[uuid]` 문자열이 보이지 않음**(과거 생성 리포트 포함).
- 출처 칩(인용문 링크)은 **그대로 동작**.
- 발행 안 된(draft) 리포트는 서비스에 안 보임.
- 커밋: `feat: 경쟁사 주간 리포트 카드 목록·상세 진입 + 인라인 UUID 제거 (지시서 283)`

## 6. 후속(범위 밖)

- 284 — 어드민 발행 스케줄(요일·시각·자동발행).
- 리포트 표지 이미지(전략보고서 카드처럼) — 커버 소스 우선순위 설계와 연계.
- 과거 리포트 페이지네이션(현재는 최근 N건).
