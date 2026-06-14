export interface LlmResult {
  text: string
  tokens: number
}

export interface LlmProvider {
  name: string
  isConfigured(): boolean
  complete(system: string, user: string): Promise<LlmResult | null>
}
