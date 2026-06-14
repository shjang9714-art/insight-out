import type { LlmProvider, LlmResult } from '@/lib/llm/types'

interface OpenAICompatConfig {
  name: string
  baseURL: string
  keysEnv: string
  defaultModel: string
  modelEnv: string
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { total_tokens?: number }
}

function getKeys(keysEnv: string): string[] {
  return (process.env[keysEnv] ?? '').split(',').map(k => k.trim()).filter(Boolean)
}

async function tryComplete(
  baseURL: string,
  key: string,
  model: string,
  system: string,
  user: string
): Promise<{ result: LlmResult | null; retryable: boolean }> {
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      return { result: null, retryable: res.status === 401 || res.status === 429 }
    }

    const data = (await res.json()) as ChatCompletionResponse
    const text = data.choices?.[0]?.message?.content
    if (!text) return { result: null, retryable: false }

    return {
      result: { text, tokens: data.usage?.total_tokens ?? 0 },
      retryable: false,
    }
  } catch {
    return { result: null, retryable: false }
  }
}

export function openaiCompatProvider(config: OpenAICompatConfig): LlmProvider {
  const { name, baseURL, keysEnv, defaultModel, modelEnv } = config

  return {
    name,

    isConfigured() {
      return getKeys(keysEnv).length > 0
    },

    async complete(system, user) {
      const keys = getKeys(keysEnv)
      if (!keys.length) return null

      const model = (process.env[modelEnv] ?? '').trim() || defaultModel

      // 랜덤 키 1개 선택, 실패(401/429) 시 나머지 중 1개 재시도
      const idx = Math.floor(Math.random() * keys.length)
      const firstKey = keys[idx]

      const first = await tryComplete(baseURL, firstKey, model, system, user)
      if (first.result) return first.result

      if (first.retryable && keys.length > 1) {
        const remaining = keys.filter((_, i) => i !== idx)
        const secondKey = remaining[Math.floor(Math.random() * remaining.length)]
        const second = await tryComplete(baseURL, secondKey, model, system, user)
        if (second.result) return second.result
      }

      return null
    },
  }
}
