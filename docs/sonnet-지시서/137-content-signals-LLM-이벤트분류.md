# 지시서 137 — content_signals LLM 이벤트 분류 (A1)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 확인: `src/lib/crawler/classify.ts`(classifyRelevance = llmComplete('classify') 패턴, 미러) · `src/lib/llm/parse.ts`(looseJsonParse) · `src/lib/crawler/orchestrator.ts`(L463~486 rule content_signals 적재) · `docs/sql-handoff/65-content-signals.sql`(enum·테이블·source) · `src/lib/contents/enrich-body.ts`+`src/app/api/admin/body-backfill`+`/api/cron/body-backfill`(드레인·버튼·cron 구조 미러) · `src/components/admin/AdminContentManager.tsx`("기사 풀본문 채우기" 자동반복 UX 미러).
> **코드 + SQL 핸드오프 1건.** 코드는 marker 컬럼 없어도 graceful degrade. `npm install` 먼저.

---

## 배경

`content_signals.signal_type`은 8종인데 **rule 기반은 3종만**(경쟁사동향·규제·정부·기술트렌드 = keyword_groups.signal_hint). **이벤트형 5종(신제품·출시 / 투자·M&A / 시장지표 / 파트너십 / 인사·조직)은 그룹 멤버십으로 판정 불가 → 65 SQL이 "LLM 후속 슬라이스"로 명시한 빈자리.** 이게 채워져야 **134 기업 사건 타임라인·135 이슈 자동 큐레이션의 품질이 살아남**(현재 이벤트 신호가 거의 없어 타임라인이 빈약).

해법: LLM이 콘텐츠를 읽고 해당 signal_type(다중)을 부여 → `content_signals` source='llm' 적재. 운영은 **백필(어드민 버튼)+cron 드레인**으로(풀본문 채우기 128/129 구조 재사용, 크롤 핫패스 미변경 = 안전).

---

## A. SQL 핸드오프 — `docs/sql-handoff/137-signals-classified-marker.sql` (신규)
```sql
-- 137: LLM 신호 분류 진행 마커. 멱등.
alter table public.contents
  add column if not exists signals_classified_at timestamptz;
create index if not exists contents_signals_classified_idx
  on public.contents (signals_classified_at);
```
- rule 신호 유무와 무관한 "LLM 분류 시도 완료" 표시(재시도 방지·드레인 대상 산정).

## B. LLM 분류 — `src/lib/contents/classify-signals.ts` (신규)
`classify.ts` 패턴 미러.
```ts
import type { SignalType } from '@/lib/types'   // 8종 enum
export async function classifyContentSignals(
  title: string, snippet: string
): Promise<{ signal_type: SignalType; score: number }[] | null>
```
- system: "B2B 텔레콤/엔터프라이즈 시장 큐레이터. 이 기사에 해당하는 **사건/신호 유형**을 아래 목록에서 0개 이상 고르라(다중). 특히 이벤트형(신제품·출시/투자·M&A/시장지표/파트너십/인사·조직) 판정에 집중. 해당 없으면 빈 배열. **JSON만**: {\"signals\":[{\"type\":\"...\",\"score\":0~1}]}." + enum 8종 나열.
- user: `제목 + 발췌(300자)`. `llmComplete('classify', system, user)` → `looseJsonParse`.
- 검증: type이 enum 8종에 속하는 것만, score 0~1 클램프(기본 0.7), 중복 type 제거. 파싱 실패/키 없음/한도 → **null**(throw 금지, 결정적 폴백).

## C. 백필 드레인 — `POST /api/admin/signals-backfill?limit=N` (신규)
- 어드민 게이트, `runtime nodejs`, `maxDuration 300`. **limit clamp 1~20**(LLM 콜이라 보수적, 기본 10).
- 대상: `contents` where `signals_classified_at IS NULL` AND `status='published'`(관련 기사 한정), `collected_at desc`, limit.
- 각 행: `classifyContentSignals(title, summary_ko|snippet)` → 결과를 `content_signals` **upsert**(`source:'llm'`, `onConflict:'content_id,signal_type', ignoreDuplicates:true` = rule 신호와 충돌 무시) → 해당 콘텐츠 `signals_classified_at=now()`(분류 결과 0개여도 마킹 = 재시도 방지).
- 반환 `{ processed, tagged, remaining }`. **graceful degrade**: `signals_classified_at` 컬럼 없으면(42703) 503+안내(또는 no-op) — 130식.
- (권장) 드레인 루프 헬퍼를 `classify-signals.ts`에 `drainSignals(admin,{limit,deadline?})`로 추출 → 라우트·cron 공유.

## D. 어드민 버튼 — `AdminContentManager.tsx`
- "기사 풀본문 채우기" 옆에 **"신호 분류"** 버튼: **자동 반복 드레인**(10건씩 remaining 0까지) + 진행률("누적 처리 N · 신호 M · 남은 R") + **중단**. (129 자동반복 UX 그대로 재사용.)

## E. 유지 cron — `src/app/api/cron/signals-backfill/route.ts` (신규)
- `cron/body-backfill` 미러: CRON_SECRET 인증, `maxDuration 300`, **270초 시간상자 드레인**(`drainSignals`). `vercel.json` += `{ "path": "/api/cron/signals-backfill", "schedule": "0 18 * * *" }`(KST 03:00).

---

## F. v2 (짓지 않음)
- 크롤 인라인 분류(신규 콘텐츠 즉시) · classify 1콜에 relevance+signals 통합 · 신호 score 정밀화 · LLM 신호 적재 후 134 사건 타임라인 자동 재생성.

---

## 검증 (구현 에이전트)
- `npx tsc --noEmit` 0 / `npx eslint`(변경 파일) 0 / 하드코딩 hex 0.
- enum 밖 type·잘못된 score 제거. rule 신호와 멱등 충돌 무시.
- LLM 키 없을 때 null·드레인 graceful(throw 0). marker 컬럼 없을 때 graceful.
- 0개 결과도 marking → 재드레인 시 무한루프 0(remaining 감소).
- 회귀 0: 크롤 rule 신호 적재·기존 content_signals 무영향.
- 커밋·푸시.

## 운영 순서
1. 구현·커밋·푸시 → 배포(`/api/version` 캐시버스트). (graceful → SQL 전 배포 안전.)
2. 수희: `137-signals-classified-marker.sql` 실행.
3. David: `/admin/contents` "신호 분류" 드레인 → 134 사건 타임라인·135 큐레이션이 이벤트 신호로 풍부해짐 확인.

## 다음 (예고 · AI 잔여 리스트)
- **A2 엔티티 정규화·동의어**(공통 토대) → **B1 검색 RAG**. [AI작업-잔여-리스트-2026-06-22 §A·B]
