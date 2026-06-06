import type { TranslateProvider } from '@/lib/translate/types'

interface DeepLResponse {
  translations?: Array<{ text?: string }>
}

const deeplProvider: TranslateProvider = {
  name: 'deepl',
  monthlyCharLimit: 500_000,

  isConfigured() {
    return Boolean(process.env.DEEPL_API_KEY)
  },

  async translate(text) {
    const apiKey = process.env.DEEPL_API_KEY
    if (!apiKey) return null

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        source_lang: 'EN',
        target_lang: 'KO',
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) return null
    const data = (await response.json()) as DeepLResponse
    const translatedText = data.translations?.[0]?.text
    return translatedText ? { text: translatedText, chars: text.length } : null
  },
}

export default deeplProvider
