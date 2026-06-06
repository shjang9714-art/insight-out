import type { TranslateProvider } from '@/lib/translate/types'

interface PapagoResponse {
  message?: {
    result?: {
      translatedText?: string
    }
  }
}

const PAPAGO_MAX_CHARS_PER_REQUEST = 5_000

const papagoProvider: TranslateProvider = {
  name: 'papago',
  monthlyCharLimit: 100_000,

  isConfigured() {
    return Boolean(
      process.env.PAPAGO_CLIENT_ID && process.env.PAPAGO_CLIENT_SECRET
    )
  },

  async translate(text) {
    const clientId = process.env.PAPAGO_CLIENT_ID
    const clientSecret = process.env.PAPAGO_CLIENT_SECRET
    if (!clientId || !clientSecret || text.length > PAPAGO_MAX_CHARS_PER_REQUEST) {
      return null
    }

    const response = await fetch(
      'https://papago.apigw.ntruss.com/nmt/v1/translation',
      {
        method: 'POST',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'en',
          target: 'ko',
          text,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!response.ok) return null
    const data = (await response.json()) as PapagoResponse
    const translatedText = data.message?.result?.translatedText
    return translatedText ? { text: translatedText, chars: text.length } : null
  },
}

export default papagoProvider
