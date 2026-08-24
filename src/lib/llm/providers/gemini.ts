import type { LlmProvider, LlmResult } from '@/lib/llm/types'
import { LlmModelUnavailableError, LlmRateLimitError } from '@/lib/llm/types'
import { classifyHttpStatus } from '@/lib/llm/http-status'

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

  getKeyCount() {
    return getKeys().length
  },

  async complete(system, user, model?: string) {
    const keys = getKeys()
    if (!keys.length) return null

    const resolvedModel = model || (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash'

    // 랜덤 키 1개 선택, 실패(401/429) 시 나머지 중 1개 재시도
    const idx = Math.floor(Math.random() * keys.length)
    const orderedKeys = [keys[idx], ...keys.filter((_, i) => i !== idx).slice(0, 1)]

    // 시도한 키가 전부 401/429(한도소진)였는지 — 그렇다면 상위(completeWithRetry)가
    // 같은 provider 를 재시도하지 않고 즉시 다음 provider·쿨다운으로 넘어가게 throw한다.
    // (openai-compat 프로바이더와 동일 계약. 이게 없으면 Gemini 만 쿨다운이 안 걸려
    //  크롤 매 요약 호출마다 재시도되는 "재시도 지옥"이 발생 — 2026-07-12 504 원인.)
    let sawHardLimit = false
    let hardLimitKind: 'rate' | 'auth' | undefined
    let hardLimitStatus: number | undefined

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
          const { permanent, retryable, kind } = classifyHttpStatus(res.status, { treat400AsAuth: true })
          if (permanent) throw new LlmModelUnavailableError('gemini', res.status)
          if (retryable) {
            sawHardLimit = true
            hardLimitKind = kind
            hardLimitStatus = res.status
            continue
          }
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
      } catch (err) {
        if (err instanceof LlmModelUnavailableError) throw err
        console.error('[gemini] 호출 실패(네트워크/타임아웃):', err)
        continue
      }
    }

    if (sawHardLimit) throw new LlmRateLimitError('gemini', hardLimitKind, hardLimitStatus)
    return null
  },
}

export default geminiProvider
