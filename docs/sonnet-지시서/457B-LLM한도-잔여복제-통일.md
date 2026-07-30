# 지시서 457-B — LLM 실효 한도 잔여 복제 3곳 통일

**SQL 0 · env 0 · 의존성 0.** 브랜치 `agent/457b-token-limit-unify`. 선행: 457 머지(`token-limit.ts` 존재).

## 배경
457이 `effectiveTokenLimit()`로 3곳을 통일했으나, 재현검증에서 **같은 공식이 3곳 더** 남아 있고 **변종이 서로 다르다**는 것이 확인됐다.

| 위치 | 현재 식 | 키 0개일 때 |
|---|---|---|
| `src/lib/admin/analytics.ts:148` | `… * Math.max(keyCount, 1)` | **한도 1,000,000** ← 라우팅과 불일치 |
| `src/lib/ops/detect-issues.ts:28` | `… * (p ? getProviderKeyCount(p) : 1)` | provider 미발견 시 **× 1** |
| `src/lib/ops/weekly-report.ts:57` | `… * (configured ? getProviderKeyCount(configured) : 1)` | 동일 |

라우팅 정본(`llm/index.ts`)은 **키 0개 → 한도 0 → 해당 provider 건너뜀**이다.
⇒ 지금은 **AI비용 화면·일일 운영 브리핑 메일·주간 운영 리포트 메일**이 어드민 화면과 다른 사용률을 말할 수 있다. 457이 LlmManager에 넣은 "키 미설정" 표기와도 모순된다.

## 변경

### 1. 3곳 치환 — 라우팅 기준으로 통일
위 3곳을 `effectiveTokenLimit(settingLimit, keyCount)`로 교체한다. `Math.max(…, 1)`·`: 1` 변종은 **제거**한다(키 0개 = 한도 0 = 라우팅 실제 동작).
`?? 1_000_000` 인라인도 `DEFAULT_MONTHLY_TOKEN_LIMIT`로 교체.

### 2. 한도 0 처리 — 단순 치환만 하면 화면이 더 이상해진다
치환하면 키 0개 provider의 `limit`이 0이 되고, 기존 가드(`limit > 0 ? … : 0`)가 **percent를 0으로** 만든다.
→ **사용 기록이 있는데 0%로 보이는** 상태가 된다. 표기를 함께 고쳐야 한다.
- **`analytics.ts`**: `currentUsage` 항목에 **`keyCount` 추가**. `AiCostAnalyticsView`는 `keyCount === 0`이면 % 대신 **"키 미설정"**(457 `LlmManager`와 같은 문구·같은 판정)으로 표시.
- **`detect-issues.ts` / `weekly-report.ts`**: 한도 0이면 사용량 경고를 내지 않는다(현 가드로 자연 스킵). **NaN·Infinity가 나오지 않는지 반드시 확인** — 특히 `weekly-report.ts`의 `pct(used, limit)`에 `limit = 0`이 들어갈 때.
  키 0개 provider에 사용 기록이 남는 경우(키를 방금 제거)는 무해하므로 별도 신호를 추가하지 않는다. 그 이유를 **주석 1줄로 남긴다**.

### 3. 범위 밖 — 손대지 말 것
- **순회 대상 집합의 차이는 유지한다.** `analytics.ts`·`admin/page.tsx`는 `LLM_PROVIDERS` 전체를 돌고, `detect-issues.ts`·`weekly-report.ts`는 `usedMap`(사용 기록 있는 것만)을 돈다. 목적이 다르므로 **통일하지 않는다.**
- `TRANSLATION_MONTHLY_CHAR_CAP`·`TTS_MONTHLY_CHAR_CAP`의 `?? 1_000_000`은 **LLM 토큰 한도와 무관한 별개 상수**다. 건드리지 말 것.

## 완료조건
- `effectiveTokenLimit` 미경유 복제 **0건**(`* keyCount`·`Math.max(keyCount`·`* (p ?`·`* (configured ?` grep 0)
- **네 표면의 사용률이 동일 값**: `/admin` 대시보드 · `/admin/settings?tab=llm` · AI비용 화면 · 운영 브리핑/주간 리포트 메일
- 한도 0에서 **NaN·Infinity·0-division 없음**, 키 미설정 provider가 "0%"가 아니라 "키 미설정"으로 표기
- 순회 집합 변경 0 · 번역/TTS 상수 무변경 · tsc/lint/build

## 재현검증
변종 3종 grep 0 · `weekly-report.ts` `pct(used, 0)` 결과 확인 · `AiCostAnalyticsView` 문구가 457 `LlmManager`와 동일 · 번역/TTS cap diff 0.
