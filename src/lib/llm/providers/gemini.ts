import type { LlmProvider, LlmResult } from '@/lib/llm/types'

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  usageMetadata?: { totalTokenCount?: number }
}

function getKeys(): string[] {
  return (process.env.GEMINI_API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
}

const geminiProvider: LlmProvider = {
  name: 'gemini',

  isConfigured() {
    return getKeys().length > 0
  },

  async complete(system, user, model?: string) {
    const keys = getKeys()
    if (!keys.length) return null

    const resolvedModel = model || (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash'

    // 랜덤 키 1개 선택, 실패(401/429) 시 나머지 중 1개 재시도
    const idx = Math.floor(Math.random() * keys.length)
    const orderedKeys = [keys[idx], ...keys.filter((_, i) => i !== idx).slice(0, 1)]

    for (const key of orderedKeys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${key}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: user }] }],
          }),
          signal: AbortSignal.timeout(30_000),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`[gemini] HTTP ${res.status}: ${body.slice(0, 500)}`)
          if (res.status === 401 || res.status === 429) continue
          return null
        }

        const data = (await res.json()) as GeminiResponse
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          console.error(`[gemini] 응답에 text 없음: ${JSON.stringify(data).slice(0, 500)}`)
          continue
        }

        return {
          text,
          tokens: data.usageMetadata?.totalTokenCount ?? 0,
        } satisfies LlmResult
      } catch {
        continue
      }
    }

    return null
  },
}

export default geminiProvider
