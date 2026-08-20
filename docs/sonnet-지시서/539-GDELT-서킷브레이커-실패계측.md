# 지시서 539 — GDELT 서킷 브레이커와 실패 계측

> 플래너(Opus) · 2026-08-20 · 기준 `origin/main = 66a6279` · 브랜치 `agent/539-gdelt-circuit`
> 근거: 2026-08-19 21:33 UTC `cron:crawl-seeds` 런의 `job_runs.meta` 실측.

## 실측 사실 (재조사 금지)

```
providerStatus.gdelt = "failed"
providerErrors.gdelt = 'seed "Private 5G": The operation was aborted due to timeout'
duration_ms          = 265,388
truncatedPhases      = ["keyword_search", "company_seed"]
companySeedsProcessed = 0 / 33      ← 5일 연속 0
```

- 실패 원인은 **10초 fetch 타임아웃**이다(`gdelt-news.ts` `AbortSignal.timeout(10_000)`).
  쿼리 문법 오류도, 차단도, `GDELT_ENABLED` 킬스위치도 아니다.
- GDELT DOC API 는 살아 있고 **429(rate limit)** 를 돌려준다(플래너가 직접 확인).
  시드 14개를 연속 호출하는 현재 구조와 맞아떨어진다.
- **시드당 최대 10초가 실패에만 쓰인다. 14개면 상한 140초 — 240초 소프트 데드라인의 58%.**
  이것이 기업 시드가 매일 0개 처리되는 유력한 원인이다.
  ⚠️ 단 **몇 개 시드가 실패했는지는 현재 계측되지 않는다**(`providerErrors.gdelt` 가
  `??=` 라 첫 오류만 남는다). 위 58% 는 상한이지 실측치가 아니다. 그래서 ②가 필요하다.

## 작업

### ① GDELT 런 단위 서킷 브레이커 — `crawlKeywordSearch` (`orchestrator.ts`)

연속 실패가 임계에 닿으면 **그 런의 남은 시드에서는 GDELT 호출을 건너뛴다.**

```ts
const GDELT_FAILURE_CIRCUIT = 2   // 상수로 추출(523 방식)
```

- 연속 실패 카운터를 두고, `GDELT_FAILURE_CIRCUIT` 에 닿으면 이후 시드에서 `fetchGdeltNews` 를
  **호출하지 않는다.** 성공하면 카운터를 0으로 되돌린다.
- 건너뛴 것을 **성공으로 위장하지 말 것.** `providerStatus.gdelt` 는 `'failed'` 를 유지한다.

### ② 실패 계측 — 첫 오류만 남기는 것을 고친다

`providerErrors.gdelt` 를 요약 문자열로 바꾼다. 형식은 아래 세 값이 반드시 들어갈 것:

```
시도 M개 / 실패 N개 / 서킷으로 건너뜀 K개 — 첫 오류: <원문>
```

이 세 숫자가 없으면 예산을 얼마나 잃는지 다음에도 알 수 없다.
`CrawlLogsPanel` 은 이미 `providerErrors.gdelt` 원문을 그대로 노출하므로 **화면 코드는 안 고친다.**

### ③ 타임아웃 10초 → 6초

같은 파일 안의 다른 크롤 fetch(`resolve-url.ts` 6000, `title-research.ts` 6000)와 맞춘다.
서킷과 합치면 최악의 손실이 140초에서 12초로 줄어든다.

## 하지 않을 것

- GDELT 쿼리 문법·`sourcelang` 변경 — 원인이 아니다
- 어댑터 제거, `GDELT_ENABLED` 기본값 변경
- 소프트 데드라인·회사 시드 예산 상수 조정 — 이번 변경의 효과를 먼저 측정한다
- 화면(`CrawlLogsPanel`) 수정

## 검증

1. `npx tsc --noEmit` / `npx eslint` / `npm run build`
2. **머지 후 다음 `cron:crawl-seeds` 런에서 `job_runs.meta` 를 확인한다** — 이게 진짜 검증이다.
   - `providerErrors.gdelt` 에 시도/실패/건너뜀 세 숫자가 찍히는가
   - `companySeedsProcessed` 가 **0보다 커지는가** (예산 회수 여부)
   - `truncatedPhases` 에서 `company_seed` 가 빠지는가
3. GDELT 가 정상 응답하는 날에는 `providerStatus.gdelt = 'enabled'` 로 남고
   서킷이 걸리지 않는지(성공 시 카운터 리셋 동작)
