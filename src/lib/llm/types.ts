export type LlmTask = 'classify' | 'summarize' | 'report'

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
