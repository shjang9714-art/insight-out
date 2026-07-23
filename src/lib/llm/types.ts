export type LlmTask = 'classify' | 'summarize' | 'report' | 'briefing' | 'key_insight' | 'daily_insight' | 'newsletter_card_insight'

export interface LlmResult {
  text: string
  tokens: number
}

export interface LlmProvider {
  name: string
  isConfigured(): boolean
  /** model 미지정 시 provider 기본값 사용 */
  complete(system: string, user: string, model?: string): Promise<LlmResult | null>
}

/** provider 가 한도/인증으로 소진(429/401) — 재시도 무의미, 즉시 다음 provider 로. */
export class LlmRateLimitError extends Error {
  constructor(public readonly providerName: string) {
    super(`${providerName}: rate limited (429/401)`)
    this.name = 'LlmRateLimitError'
  }
}
