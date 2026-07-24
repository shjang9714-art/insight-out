import type { LlmProvider, LlmResult } from '@/lib/llm/types'
import { LlmRateLimitError } from '@/lib/llm/types'

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
  providerName: string,
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
      const body = await res.text().catch(() => '')
      console.error(`[${providerName}] HTTP ${res.status}: ${body.slice(0, 500)}`)
      return { result: null, retryable: res.status === 401 || res.status === 429 }
    }

    const data = (await res.json()) as ChatCompletionResponse
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      console.error(`[${providerName}] 응답에 text 없음: ${JSON.stringify(data).slice(0, 500)}`)
      return { result: null, retryable: false }
    }

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

    getKeyCount() {
      return getKeys(keysEnv).length
    },

    async complete(system, user, model?: string) {
      const keys = getKeys(keysEnv)
      if (!keys.length) return null

      const resolvedModel = model || (process.env[modelEnv] ?? '').trim() || defaultModel

      // 랜덤 키 1개 선택, 실패(401/429) 시 나머지 중 1개 재시도
      const idx = Math.floor(Math.random() * keys.length)
      const firstKey = keys[idx]

      const first = await tryComplete(name, baseURL, firstKey, resolvedModel, system, user)
      if (first.result) return first.result
      let sawHardLimit = first.retryable

      if (first.retryable && keys.length > 1) {
        const remaining = keys.filter((_, i) => i !== idx)
        const secondKey = remaining[Math.floor(Math.random() * remaining.length)]
        const second = await tryComplete(name, baseURL, secondKey, resolvedModel, system, user)
        if (second.result) return second.result
        sawHardLimit = sawHardLimit || second.retryable
      }

      // 429/401(한도소진·인증실패)은 재시도 무의미 — 상위(completeWithRetry)가 즉시 다음 provider로 넘어가게 throw.
      // 그 외(5xx/timeout/빈응답)는 일시 오류로 보고 null(상위 재시도 허용).
      if (sawHardLimit) throw new LlmRateLimitError(name)
      return null
    },
  }
}
