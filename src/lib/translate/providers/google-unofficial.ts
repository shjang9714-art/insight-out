import type { TranslateProvider } from '@/lib/translate/types'

const GOOGLE_REQUEST_DELAY_MS = 1_500
let googleRequestQueue = Promise.resolve()

function readTranslatedText(data: unknown): string | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null

  const parts = data[0]
    .map((segment) => {
      if (!Array.isArray(segment) || typeof segment[0] !== 'string') return ''
      return segment[0]
    })
    .filter(Boolean)

  return parts.length > 0 ? parts.join('') : null
}

async function waitForGoogleTurn(): Promise<void> {
  const previous = googleRequestQueue
  let release: (() => void) | undefined
  googleRequestQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  await new Promise<void>((resolve) => setTimeout(resolve, GOOGLE_REQUEST_DELAY_MS))
  release?.()
}

const googleProvider: TranslateProvider = {
  name: 'google',
  monthlyCharLimit: Number.MAX_SAFE_INTEGER,

  isConfigured() {
    return true
  },

  async translate(text) {
    await waitForGoogleTurn()

    const body = new URLSearchParams({
      client: 'gtx',
      sl: 'en',
      tl: 'ko',
      dt: 't',
      q: text,
    })

    const response = await fetch(
      'https://translate.googleapis.com/translate_a/single',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!response.ok) return null
    const translatedText = readTranslatedText(await response.json())
    return translatedText ? { text: translatedText, chars: text.length } : null
  },
}

export default googleProvider
