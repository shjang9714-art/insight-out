export type LlmTask = 'classify' | 'summarize' | 'report' | 'briefing' | 'key_insight' | 'daily_insight' | 'newsletter_card_insight' | 'search'

export interface LlmResult {
  text: string
  tokens: number
}

export interface LlmProvider {
  name: string
  isConfigured(): boolean
  /** 등록된 API 키 개수. 키 값은 외부에 노출하지 않는다. */
  getKeyCount(): number
  /** model 미지정 시 provider 기본값 사용 */
  complete(system: string, user: string, model?: string): Promise<LlmResult | null>
}

/**
 * provider 가 한도/인증으로 소진(429/401) — 재시도 무의미, 즉시 다음 provider 로.
 * `kind`: 'rate'(429, 분당 제한 — 수십 초면 풀림) | 'auth'(401, 키 만료·인증 실패 — 스스로 낫지 않음).
 * 기본값은 보수적으로 'auth'(기존 3분 쿨다운) — HTTP 상태를 실제로 구분해 채우는 provider(openai-compat 계열)만
 * 'rate' 를 명시적으로 넘겨 30초 쿨다운을 받는다.
 */
export class LlmRateLimitError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly kind: 'rate' | 'auth' = 'auth',
    public readonly status?: number,
  ) {
    super(`${providerName}: rate limited (429/401)`)
    this.name = 'LlmRateLimitError'
  }
}

/** provider 모델이 영구적으로 사용 불가(404/400) — 같은 모델로 재시도해도 결과가 같다. 쿨다운 대상 아님(모델 문제이지 한도 문제가 아님). */
export class LlmModelUnavailableError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly status?: number,
  ) {
    super(`${providerName}: model unavailable (404/400)`)
    this.name = 'LlmModelUnavailableError'
  }
}
