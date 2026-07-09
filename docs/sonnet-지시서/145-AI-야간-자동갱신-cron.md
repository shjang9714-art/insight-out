# 지시서 145 — AI 야간 자동 갱신 cron [D1 자동화]

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 확인: `src/app/api/cron/crawl/route.ts`·`/api/cron/body-backfill`·`/api/cron/signals-backfill`(CRON_SECRET 인증·시간상자 패턴 미러) · `src/lib/insight/generate.ts`(generateIndustryInsightCards) · `src/lib/issues/generate-candidates.ts`(135) · `src/lib/entities/generate-events.ts`(134) · `src/lib/issues/brief.ts`(131) · `vercel.json`(crons).
> **코드 전용(SQL 없음 — 마커 기존: entity_events.generated_at·issues.brief_generated_at·insight_cards 기간키).** `npm install` 먼저.

---

## 배경 (D1)

이슈 후보·사건 타임라인·이슈 브리핑·인사이트 카드가 **전부 어드민 수동 버튼.** 검증 끝났으니 **야간 cron으로 자동 갱신**(버튼 클릭 해방). 신호 분류(137)·본문(129)은 이미 cron 有. **정규화 병합(141)은 사람 확인 필수 → 자동화 제외**(자동 병합 금지).

**원칙(브레이크)**: 단일 cron이 **시간상자(270초) 안에서 가치순으로** 처리, 못 끝낸 건 다음 밤. 각 생성기는 **기존 함수 재사용**(중복 0). 후보·드래프트는 여전히 어드민 검토(자동 발행 아님 = D2 별건).

---

## A. 단일 오케스트레이터 cron — `src/app/api/cron/ai-refresh/route.ts` (신규)
- `cron/crawl` 인증·런타임 미러: CRON_SECRET Bearer, `runtime nodejs`, `maxDuration 300`, `dynamic force-dynamic`.
- `const deadline = Date.now() + 270_000`. 각 단계·항목 후 `Date.now() < deadline` 체크, 초과 시 중단(graceful, 다음 밤 이어서).
- **가치순 실행:**
  1. **인사이트 카드**: `generateIndustryInsightCards`(현재 기간, 내부 bounded) 1회.
  2. **이슈 후보**: `generateIssueCandidates`(기본 opts) → draft insert(135 로직). (검토는 어드민.)
  3. **사건 타임라인 드레인**: 대상 = 경쟁사 + 워치리스트 언급 + mention 상위 엔티티, **`entity_events` 최신 generated_at ASC NULLS FIRST**(가장 오래/미생성 먼저) → 데드라인까지 `generateEntityEvents` 순차(엔티티당 1콜). 회당 상한(예 ≤15).
  4. **이슈 브리핑 드레인**: published 이슈 **`brief_generated_at` ASC NULLS FIRST** → 데드라인까지 `generateIssueBrief` 순차. 회당 상한(예 ≤15).
- 각 단계 try/catch 격리(한 단계 실패가 다음 막지 않음). 응답 `{ ok, insights, candidates, timelines, briefs, errors }`(어드민/로그 확인용).
- **LLM 키 없으면**(llm-test/llmComplete null) 조용히 skip(생성 0, throw 0).

## B. 스케줄 — `vercel.json`
- crons에 추가: `{ "path": "/api/cron/ai-refresh", "schedule": "0 21 * * *" }`(UTC 21:00 = **KST 06:00**, 크롤 05:00 KST·본문/신호 백필 뒤). 기존 크롤/백필 시각과 겹치지 않게.

## C. (선택·가벼우면) 어드민 수동 트리거 + 마지막 실행 표시
- `/admin`(현황판) 또는 인사이트 관리에 **"지금 AI 갱신"** 버튼(→ ai-refresh를 어드민 인증으로 1회 호출, 또는 동일 로직 재사용) + 마지막 실행 시각·결과 요약. (무거우면 v2.)

---

## D. v2 (짓지 않음)
- **D2 자동 발행 게이팅**(품질 점수 기반 draft→published 자동) · 진행 상태 영속(DB) · 단계별 개별 스케줄 분리 · 정규화 제안 자동 생성(병합은 여전히 수동).

---

## 검증 (구현 에이전트)
- `npx tsc --noEmit` 0 / `npx eslint`(변경 파일) 0 / 하드코딩 hex 0.
- CRON_SECRET 인증(미인증 401), 시간상자 270초 준수(초과 graceful 중단).
- 각 생성기 **기존 함수 재사용**(로직 복제 0), 단계 격리(부분 실패 continue).
- 드레인 정렬(stalest 먼저)로 매 밤 다른 대상 처리 → 며칠 내 전체 1순환.
- LLM 키 없을 때 throw 0·skip. 회귀 0: 기존 수동 버튼·크론 무영향.
- 커밋·푸시.

## 운영 순서
1. 구현·커밋·푸시 → 배포(`/api/version` 캐시버스트). CRON_SECRET은 기존 크론과 동일(이미 설정됨).
2. (검증) 다음 밤(또는 어드민 "지금 AI 갱신") 후 인사이트·이슈 후보·사건 타임라인·브리핑이 자동 채워졌는지 확인.

## 다음 (예고 · AI 잔여 리스트)
- **A3 LLM 의미 기반 콘텐츠 매칭**(이슈 배정 keyword ILIKE 보완) · **C 폴리시**(company-scope 배선·논조 자동화) · 후반(GraphRAG·소스 품질). [AI작업-잔여-리스트 §A·C·E]
