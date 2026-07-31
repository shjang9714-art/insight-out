import type { LlmProvider, LlmResult } from '@/lib/llm/types'
import { LlmModelUnavailableError, LlmRateLimitError } from '@/lib/llm/types'

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

interface TryCompleteResult {
  result: LlmResult | null
  /** 401/429 — 다른 키로 재시도해볼 가치가 있음 */
  retryable: boolean
  /** 404/400 — 같은 모델로 다시 불러도 결과가 같다. 키 재시도 없이 즉시 종료 대상 */
  permanent: boolean
  /** retryable이 true일 때만 의미 있음. 429='rate'(수십 초면 풀림), 401='auth'(스스로 안 낫음) */
  kind?: 'rate' | 'auth'
}

async function tryComplete(
  providerName: string,
  baseURL: string,
  key: string,
  model: string,
  system: string,
  user: string
): Promise<TryCompleteResult> {
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
      // 404/400은 영구 오류 — 같은 모델로 재시도해도 같은 결과. 재시도 대상(401/429)과 분리한다.
      const permanent = res.status === 404 || res.status === 400
      const retryable = res.status === 401 || res.status === 429
      const kind = res.status === 429 ? 'rate' : res.status === 401 ? 'auth' : undefined
      return { result: null, retryable, permanent, kind }
    }

    const data = (await res.json()) as ChatCompletionResponse
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      console.error(`[${providerName}] 응답에 text 없음: ${JSON.stringify(data).slice(0, 500)}`)
      return { result: null, retryable: false, permanent: false }
    }

    return {
      result: { text, tokens: data.usage?.total_tokens ?? 0 },
      retryable: false,
      permanent: false,
    }
  } catch {
    return { result: null, retryable: false, permanent: false }
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
      // 404/400은 영구 오류 — 다른 키로 재시도해도 같은 모델이 같은 이유로 실패한다. 즉시 종료.
      if (first.permanent) throw new LlmModelUnavailableError(name)
      let sawHardLimit = first.retryable
      let hardLimitKind = first.kind

      if (first.retryable && keys.length > 1) {
        const remaining = keys.filter((_, i) => i !== idx)
        const secondKey = remaining[Math.floor(Math.random() * remaining.length)]
        const second = await tryComplete(name, baseURL, secondKey, resolvedModel, system, user)
        if (second.result) return second.result
        if (second.permanent) throw new LlmModelUnavailableError(name)
        sawHardLimit = sawHardLimit || second.retryable
        hardLimitKind = second.kind ?? hardLimitKind
      }

      // 429/401(한도소진·인증실패)은 재시도 무의미 — 상위(completeWithRetry)가 즉시 다음 provider로 넘어가게 throw.
      // 그 외(5xx/timeout/빈응답)는 일시 오류로 보고 null(상위 재시도 허용).
      if (sawHardLimit) throw new LlmRateLimitError(name, hardLimitKind)
      return null
    },
  }
}
