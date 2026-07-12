# 지시서 293 — LLM 산출물의 `<quote>` 태그·UUID 전역 제거

> 작성: Opus(플래너) · 2026-07-12 · 근거: David —
> *"주요 기업 카드 본문에 `<quote>'금의환향' 주목</quote> [9f6b8f67-f77a-...]` 가 그대로 노출된다."*
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 있음**: `docs/sql-handoff/293-LLM프롬프트-인라인태그금지.sql` (수희, 멱등).
> **283의 미완성분을 마무리한다.**

---

## 0. 한 줄

LLM이 서술문에 박아 넣는 **`<quote>` 태그와 `[uuid]` 마커를 전역에서 제거**한다. 283은 경쟁사 주간만 고쳤다.

---

## 1. 현행 진단 (검증된 코드 사실)

### 1.1 283은 1/3만 고쳤다
LLM 생성기 **3개 전부** `citations: [{content_id, quote}]`를 요구한다:

| 생성기 | 프롬프트 key | 상태 |
|---|---|---|
| `src/lib/insight/generate.ts` | `company_insight` (253) | ❌ **누출 중** ← David 발견 |
| `src/lib/competitor-weekly/generate.ts` | `competitor_weekly_area` (261) | ✅ 283에서 처리 |
| `src/lib/reports/generate-strategy.ts` | `strategy_report` (274) | ❌ **미점검** |

그런데 283의 `stripInlineCitations`는 **경쟁사 주간 컴포넌트 2개에만** 적용돼 있다:
```
✅ src/components/entities/CompetitorWeeklyCard.tsx
✅ src/components/entities/CompetitorWeeklyReport.tsx
❌ 그 외 전부
```

### 1.2 ⚠️ 프롬프트만 고쳐서는 못 막는다 (중요)
- **경쟁사 주간(261)**: 프롬프트가 *"각 서술 끝에 근거 `[content_id]`"* 라고 **명시적으로 시켰다** → 283 SQL로 그 지시를 제거.
- **주요기업 인사이트(253)**: 프롬프트는 citations를 **JSON 필드로만** 요구한다. **인라인 지시가 없다.** 그런데도 **LLM이 `<quote>` 태그와 `[uuid]`를 서술문에 박아 넣는다.**

→ **LLM은 시키지 않아도 넣는다.** 프롬프트 정정은 "다음 생성분 오염 완화"일 뿐이고, **렌더 단 스트립이 최종 방어선**이다. 둘 다 해야 한다.

### 1.3 누출 표면 — 5개 컴포넌트 × 3개 필드
`insight/generate.ts` 출력: `{ card_headline, headline, implication, citations }`

| 컴포넌트 | 렌더하는 필드 |
|---|---|
| `src/components/analysis/InsightCardNewsList.tsx` | card_headline · headline · implication |
| `src/components/analysis/InsightCardsSectionClient.tsx` | card_headline · headline · implication |
| `src/components/analysis/AiInsightsView.tsx` | card_headline · headline · implication |
| `src/components/key-insights/KeyInsightCard.tsx` | headline · implication |
| `src/components/daily-insights/DailyInsightDetail.tsx` | headline · implication |

### 1.4 전략보고서 — UUID가 살균을 통과한다
- `src/lib/reports/sanitize-html.ts`의 `ALLOWED_TAGS`에 `quote`가 **없다** → `<quote>` 태그는 **discard**된다(태그만 제거, 안쪽 텍스트는 남음 — 다행).
- **그러나 `[uuid]`는 평문이라 sanitize-html이 건드리지 않는다.** 그대로 화면에 나온다.
- LLM이 `&lt;quote&gt;`처럼 **이스케이프해서** 내보내면 태그가 그대로 글자로 보인다.

### 1.5 기존 스트립 유틸(283)
`src/lib/competitor-weekly/strip-citations.ts` — **UUID만** 처리한다. `<quote>` 태그는 못 잡는다.
```ts
const INLINE_ID = /\s*\[[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}\]/g
```

---

## 2. DB / SQL — **있음**

`docs/sql-handoff/293-LLM프롬프트-인라인태그금지.sql` (수희):
- `company_insight`(253) · `strategy_report`(274) 프롬프트에 **"서술문에 태그·대괄호 id 넣지 말 것"** 명시.
- `competitor_weekly_area`는 283에서 이미 처리됨.
- **DB 프롬프트가 코드 폴백보다 우선**하므로(283에서 확인) SQL이 필수다.
- 멱등(`not like` 가드).

---

## 3. 구현

### 3-1. 공용 유틸로 승격 — `src/lib/text/strip-llm-artifacts.ts` (신규)

283의 `strip-citations.ts`를 **일반화**한다. `<quote>` 태그와 UUID를 **둘 다** 제거.

```ts
/** LLM이 서술문에 박아 넣는 산출물 아티팩트 제거(293).
 *  - [content_id] UUID 마커
 *  - <quote>...</quote> 임의 태그(및 이스케이프된 &lt;quote&gt;)
 *  근거는 citations 배열/출처 칩으로 별도 표시되므로, 서술문의 이것들은 순수 노이즈다. */
export function stripLlmArtifacts(text: string): string
```

처리 대상(순서 주의 — 태그 먼저, 그다음 UUID, 마지막 공백 정리):
1. `<quote>` / `</quote>` **태그만 제거하고 안쪽 텍스트는 보존** (인용문 자체는 의미가 있다)
   - 이스케이프 변형(`&lt;quote&gt;`, `&lt;/quote&gt;`)도 함께 처리
2. **UUID 마커** `[8-4-4-4-12]` 제거 (283 정규식 재사용)
3. 구두점 앞 공백·중복 공백 정리, trim

**회귀 가드**:
- **UUID 형태에만 매칭** — `[LG U+]`, `[2026]` 같은 정상 대괄호는 건드리지 말 것 (283에서 실측 검증한 것)
- **멱등** — 두 번 적용해도 결과 동일
- **마커가 없는 문장은 불변**

### 3-2. 283 유틸을 신규 유틸로 교체
- `src/lib/competitor-weekly/strip-citations.ts` → **삭제**하고 `stripLlmArtifacts`로 통일.
- `CompetitorWeeklyCard.tsx` · `CompetitorWeeklyReport.tsx`의 import를 새 유틸로 교체.
- **동작이 약해지면 안 된다** — 새 유틸은 283이 하던 것(UUID 제거)을 **포함**한다.

### 3-3. 주요기업 인사이트 — 5개 컴포넌트에 적용
§1.3의 5개 컴포넌트에서 **`card_headline` · `headline` · `implication`을 출력할 때** `stripLlmArtifacts()`를 통과시킨다.

> 컴포넌트마다 흩어서 적용하면 **다음에 컴포넌트가 추가될 때 또 빠진다**(283이 딱 그랬다).
> **가능하면 렌더 직전 한 곳에서** — 예: 카드 데이터를 만드는 공용 매퍼나 쿼리 레이어에서 한 번에 정제하는 편이 낫다.
> 구조상 어려우면 5곳에 적용하되, **주석으로 "새 컴포넌트 추가 시 여기도 적용" 을 남길 것.**

### 3-4. 전략보고서 — UUID 제거
- `src/app/dashboard/reports/[id]/page.tsx`에서 `body_html`을 **sanitize 하기 전에** `stripLlmArtifacts()`를 적용한다.
  - 순서: `stripLlmArtifacts(body_html)` → `sanitizeReportHtml(...)` → 렌더
  - 이유: sanitize는 태그만 다루고 **평문 UUID는 통과**시킨다.
- **276 어드민 미리보기**(`/api/admin/reports/[id]`)에도 동일하게 적용 — 같은 본문을 보여주는 곳이다.
- `summary` 필드도 같은 처리를 할 것.

### 3-5. 검증용 — 어디에도 안 남았는지 확인
구현 후 **실제 DB 데이터가 아니라 코드 경로로** 확인:
- LLM 산출물을 렌더하는 모든 곳에서 `stripLlmArtifacts`를 거치는가?
- `grep -rn "implication\|card_headline\|headline" src/components` 로 누락 컴포넌트가 없는지 대조.

---

## 4. 회귀 가드

- **UUID 형태에만 매칭** — `[LG U+]`·`[2026]` 같은 정상 대괄호를 지우면 안 된다. **283에서 실측으로 검증한 요건이다.**
- **`<quote>` 안쪽 텍스트는 보존** — 인용문 자체는 의미가 있다. **태그만** 벗긴다.
- **멱등** — 두 번 적용해도 같은 결과.
- **283이 하던 것보다 약해지면 안 된다** — 새 유틸은 UUID 제거를 포함한다.
- `citations` 배열(출처 칩 렌더)은 **건드리지 말 것.** 그건 정상 동작이다.
- sanitize-html의 `ALLOWED_TAGS`를 바꾸지 말 것 — `quote`를 허용 목록에 넣으면 안 된다.
- **프롬프트 수정(SQL)만으로 끝났다고 보지 말 것.** LLM은 시키지 않아도 넣는다. 렌더 단 스트립이 본체다.

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- **스트립 함수 단위 검증**(직접 실행):
  - `<quote>'금의환향' 주목</quote> [9f6b8f67-f77a-4b2c-8d1e-3a5f7c9b2e4d]` → `'금의환향' 주목` (태그·UUID 제거, 인용문 보존)
  - 이스케이프 변형 `&lt;quote&gt;...&lt;/quote&gt;` 도 처리
  - `[LG U+]`, `[2026]` → **보존**
  - 마커 없는 문장 → **불변**
  - 두 번 적용 → **동일**(멱등)
- **누락 없음**: LLM 서술 필드를 렌더하는 컴포넌트 전부가 유틸을 거치는지 grep으로 대조.
- 전략보고서: `body_html`이 **strip → sanitize** 순서인지. 어드민 미리보기에도 적용됐는지.
- 경쟁사 주간: 283이 하던 동작이 **그대로 유지**되는지(회귀 없음).
- 커밋: `fix: LLM 산출물의 <quote> 태그·UUID 전역 제거 (지시서 293)`

## 6. 후속(범위 밖)

- LLM 출력 스키마 강제(structured output / JSON schema) — 근본 해결이지만 공급자별 지원이 달라 별도 검토.
- 기존 저장 데이터 정제 — 렌더 단 스트립으로 화면은 가려지므로 급하지 않다. 필요하면 백필로.
