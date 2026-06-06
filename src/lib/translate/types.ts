export interface TranslateProvider {
  name: 'deepl' | 'papago' | 'google'
  monthlyCharLimit: number
  isConfigured(): boolean
  translate(text: string): Promise<{ text: string; chars: number } | null>
}
