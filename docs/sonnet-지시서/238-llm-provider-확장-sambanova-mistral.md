# 지시서 238 — LLM provider 확장 (SambaNova · Mistral 편입)

목표: 무료 LLM 용량을 확대·분산한다. 현재 분류(classify) 주력 **Cerebras가 자체 월 한도(1M) 100% 소진**(1,003,103/1,000,000), **Groq 키는 방금 등록됨**. 여기에 **SambaNova·Mistral 2종을 provider로 추가**하고 라우팅에 편입해, 한 provider 소진 시에도 빠른 무료 대안으로 흘러가게 한다.

범위: `openai-compat` 구조에 provider 2종 추가 + `src/lib/llm/index.ts` 등록 + **한도소진(429/401) fast-failover·쿨다운 개선**(David 결정: 238에 포함). **DB 라우팅/한도는 별도 SQL 핸드오프(238-llm-provider-라우팅-한도.sql, 수희)** 로 처리 — 이 지시서는 코드만.

> David 우려(정당): 무료 키라 과금 위험은 0이나, **다른 앱에서 같은 키를 써서 외부 소진**되면 429가 남. 현재도 429→다음 provider 폴백은 되지만, `completeWithRetry`가 **같은 provider를 2회 더 재시도(≈1.8초 낭비)** 후에야 넘어감 → 소진 상태에서 매 호출마다 반복. → **429/401은 재시도 없이 즉시 다음 + 소진 provider 짧은 쿨다운(skip)** 으로 해소.

전제: env는 David가 이미 Vercel(Production·Preview)에 등록 완료 — `SAMBANOVA_API_KEYS`, `MISTRAL_API_KEYS`, `GROQ_API_KEYS`, `CEREBRAS_API_KEYS`(2키), `GEMINI_API_KEYS`, `OPENROUTER_API_KEYS`.

---

## 1. 현행 진단 (검증된 코드 사실)
- provider는 `openaiCompatProvider({ name, baseURL, keysEnv, defaultModel, modelEnv })` 팩토리로 생성(`src/lib/llm/providers/openai-compat.ts`). `isConfigured()`는 `keysEnv` 콤마분리 키 ≥1개면 true. `complete()`는 랜덤 키 1개 → 401/429면 나머지 1개 재시도. **엔드포인트 `${baseURL}/chat/completions`, OpenAI 표준 body(temperature:0)** — SambaNova·Mistral 모두 OpenAI 호환이라 그대로 동작.
- 등록 지점은 `src/lib/llm/index.ts`의 **`LLM_PROVIDERS` 배열**(고정 폴백 풀 + 어드민 카드 열거원)과 **`PROVIDER_MAP`**(DB 라우팅 provider 문자열 → provider 객체). **둘 다에 추가해야** 라우팅·폴백·어드민에서 인식됨.
- 어드민 `/api/admin/llm`는 `LLM_PROVIDERS`를 map해 카드를 만든다 → 배열에 넣으면 **어드민 화면에 자동 표시**(별도 UI 작업 불필요).
- 라우팅/한도 판정은 `llm_task_routing`·`llm_settings`(DB) 기준 → **SQL 핸드오프에서 처리**(이 지시서 밖).

## 2. 구현

### 2-1. 신규 파일 `src/lib/llm/providers/sambanova.ts`
```ts
import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'sambanova',
  baseURL:      'https://api.sambanova.ai/v1',
  keysEnv:      'SAMBANOVA_API_KEYS',
  defaultModel: 'Meta-Llama-3.3-70B-Instruct',
  modelEnv:     'SAMBANOVA_MODEL',
})
```

### 2-2. 신규 파일 `src/lib/llm/providers/mistral.ts`
```ts
import { openaiCompatProvider } from './openai-compat'

export default openaiCompatProvider({
  name:         'mistral',
  baseURL:      'https://api.mistral.ai/v1',
  keysEnv:      'MISTRAL_API_KEYS',
  defaultModel: 'mistral-small-latest',
  modelEnv:     'MISTRAL_MODEL',
})
```

### 2-3. `src/lib/llm/index.ts` — import + 등록
import 블록에 추가(기존 provider import 아래):
```ts
import sambanovaProvider from '@/lib/llm/providers/sambanova'
import mistralProvider from '@/lib/llm/providers/mistral'
```
`LLM_PROVIDERS` 배열에 두 provider 추가(순서: 빠른 무료부터 — cerebras/groq 다음, gemini/openrouter 사이 취향이나, 폴백 풀은 라우팅 실패 시 안전망이므로 **아래처럼 추가**):
```ts
export const LLM_PROVIDERS: LlmProvider[] = [
  geminiProvider,
  groqProvider,
  cerebrasProvider,
  sambanovaProvider,
  mistralProvider,
  openrouterProvider,
]
```
`PROVIDER_MAP`에 두 키 추가:
```ts
const PROVIDER_MAP: Record<string, LlmProvider> = {
  gemini:      geminiProvider,
  groq:        groqProvider,
  cerebras:    cerebrasProvider,
  sambanova:   sambanovaProvider,
  mistral:     mistralProvider,
  openrouter:  openrouterProvider,
}
```

### 2-4. 한도소진 fast-failover + provider 쿨다운
현행: `openai-compat.complete()`이 429/401도 null로 뭉개 반환 → `index.ts completeWithRetry`가 null을 재시도 대상으로 보고 **같은 provider 2회 재시도**(600·1200ms) 후 다음으로. 소진 provider엔 무의미한 지연. **개선: 하드리밋(429/401)은 재시도 없이 즉시 다음 + 해당 provider 쿨다운.**

**(a) `src/lib/llm/types.ts` — 하드리밋 에러 타입 추가**
```ts
/** provider 가 한도/인증으로 소진(429/401) — 재시도 무의미, 즉시 다음 provider 로. */
export class LlmRateLimitError extends Error {
  constructor(public readonly providerName: string) {
    super(`${providerName}: rate limited (429/401)`)
    this.name = 'LlmRateLimitError'
  }
}
```

**(b) `src/lib/llm/providers/openai-compat.ts` — 하드리밋이면 throw**
- `tryComplete`는 이미 `retryable`(=401||429)을 반환 중. `complete()`에서 키 시도가 모두 실패했고 **그중 하드리밋(retryable)이 있었으면** null 대신 `throw new LlmRateLimitError(name)`. 그 외(5xx/timeout/빈응답)는 기존대로 null.
```ts
// complete() 내부: 시도 결과 취합
const first = await tryComplete(baseURL, firstKey, resolvedModel, system, user)
if (first.result) return first.result
let sawHardLimit = first.retryable
if (first.retryable && keys.length > 1) {
  const remaining = keys.filter((_, i) => i !== idx)
  const secondKey = remaining[Math.floor(Math.random() * remaining.length)]
  const second = await tryComplete(baseURL, secondKey, resolvedModel, system, user)
  if (second.result) return second.result
  sawHardLimit = sawHardLimit || second.retryable
}
if (sawHardLimit) throw new LlmRateLimitError(name)   // 재시도 무의미 → 상위가 즉시 다음 provider
return null                                            // 일시 오류 → 상위 재시도 허용
```
(파일 상단 `import { LlmRateLimitError } from '@/lib/llm/types'` 추가.)

**(c) `src/lib/llm/index.ts` — 쿨다운 레지스트리 + 즉시 폴백**
- 모듈 스코프 쿨다운 맵 + 상수:
```ts
import { LlmRateLimitError } from '@/lib/llm/types'
const COOLDOWN_MS = 3 * 60 * 1000                 // 소진 provider 3분 skip
const cooldownUntil = new Map<string, number>()   // warm 인스턴스 내 best-effort
```
- `completeWithRetry` 루프에서 `LlmRateLimitError`는 즉시 반환(재시도 안 함):
```ts
try {
  const result = await provider.complete(system, user, model)
  if (result) return { result, errorReason: null, hardLimit: false }
  lastReason = `${provider.name}: 응답 없음`
} catch (err) {
  if (err instanceof LlmRateLimitError) {
    return { result: null, errorReason: `${provider.name}: 한도소진(429/401)`, hardLimit: true }
  }
  lastReason = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
}
```
  → `ProviderAttempt`에 `hardLimit: boolean` 필드 추가(성공/일시실패는 false).
- 라우팅 루프(1단계)·폴백 루프(2단계) 양쪽에서:
  - provider 후보 스킵 조건에 **쿨다운** 추가: `if ((cooldownUntil.get(name) ?? 0) > Date.now()) continue`.
  - 호출 결과가 `hardLimit`이면 `cooldownUntil.set(name, Date.now() + COOLDOWN_MS)` 후 `continue`(다음 provider). 일반 실패(null)는 기존대로 `continue`.

**효과**: 외부 소진으로 429가 나도 (1) 같은 provider 재시도 없이 즉시 다음, (2) 이후 3분간 그 provider를 건너뛰어 매 호출 낭비 제거. 무료 provider의 월 한도(`llm_settings`)는 이제 **소프트 예산**일 뿐, 실질 컷은 provider 자체 429 + 쿨다운이 담당.

## 3. 회귀 가드
- **기존 provider·라우팅 동작 불변** — 배열/맵에 2개만 append. 기존 순서·판정 로직·재시도 그대로.
- 새 provider는 `isConfigured()`가 키 유무로만 켜짐 → env 미등록이면 자동 skip(안전). David가 이미 등록했으므로 활성.
- `PROVIDER_MAP`에 넣지 않으면 DB 라우팅에서 `PROVIDER_MAP[route.provider]`가 undefined → skip. **반드시 맵에도 추가**(위 반영).
- 어드민 카드는 `LLM_PROVIDERS` map이라 자동 표시. `llm_settings`에 행이 없어도 GET은 기본값(enabled true, limit 1M)으로 처리 → SQL에서 행 upsert 예정.
- SambaNova·Mistral 응답이 OpenAI 표준 `choices[0].message.content`·`usage.total_tokens` 스키마와 다르면 `text` 없음 → provider가 null 반환 → 다음 라우팅으로 폴백(안전). 실측에서 두 곳 모두 표준 준수 확인됨.
- **fast-failover 안전성**: `LlmRateLimitError`는 openai-compat 계열만 throw(gemini provider는 기존대로 null) → gemini 동작 불변. 하드리밋 throw는 `completeWithRetry`가 반드시 catch하므로 상위로 예외 전파 없음(전 provider 소진 시 최종 null 반환은 기존과 동일). 쿨다운 맵은 warm 인스턴스 내 best-effort(콜드스타트 시 리셋) — 정확성 아닌 낭비 감소용이라 리셋돼도 무해. 쿨다운으로 전 provider가 임시 skip돼도 3분 후 자동 해제, 그 사이엔 남은 provider가 처리.

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0 (types.ts 신규 에러클래스, openai-compat/index.ts import 포함).
- `npx eslint`(신규 2 provider + types.ts + openai-compat.ts + index.ts) 0.
- `npm run build` 통과.
- fast-failover 로직 점검: `LlmRateLimitError`가 `completeWithRetry`에서 catch되어 hardLimit:true 반환 → 라우팅 루프가 쿨다운 set 후 다음 provider로 가는지(코드 리뷰). 전 provider 쿨다운 시 최종 null 안전 반환.
- (선택) `/api/admin/llm-test`가 있으면 provider=sambanova / mistral로 1회 호출해 200·텍스트 확인(키 소량 소모).

## 5. 라이브 체크리스트 (배포 후, SQL 적용 후)
- [ ] `/admin/llm` provider 카드에 **sambanova·mistral 2종 추가 노출**, configured=✓.
- [ ] 라우팅 표에 sambanova/mistral 편입(SQL 반영分).
- [ ] Cerebras 한도 상향 후 재소진 없이 분류 정상(사용량 다시 증가).
- [ ] 크롤/분류 1회전 후 gemini 단독 부하 완화(사용량이 여러 provider로 분산).

## 6. 순서
1. 이 지시서 코드 반영(Sonnet) → tsc/eslint/build → 커밋/푸시.
2. **238 SQL(수희)** 적용 — 라우팅 편입 + Cerebras 한도 상향 + 신규 provider 행/모델 카탈로그.
3. 배포 후 `/admin/llm` 라이브 체크.

코드: 신규 2파일 + index.ts. DB는 238 SQL 핸드오프에서.
