import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import geminiProvider from '@/lib/llm/providers/gemini'
import groqProvider from '@/lib/llm/providers/groq'
import cerebrasProvider from '@/lib/llm/providers/cerebras'
import openrouterProvider from '@/lib/llm/providers/openrouter'
import type { LlmProvider } from '@/lib/llm/types'

export const LLM_PROVIDERS: LlmProvider[] = [
  geminiProvider,
  groqProvider,
  cerebrasProvider,
  openrouterProvider,
]

/**
 * LLM 완성 호출 — provider 순서대로 폴백.
 * enabled & 월 한도 여유 & isConfigured() 인 첫 provider 사용.
 * 전부 실패/소진 시 null 반환 (호출부는 결정적 폴백).
 */
export async function llmComplete(system: string, user: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const period = getKstPeriod()

    const [usageResult, settingsResult] = await Promise.all([
      admin.from('llm_usage').select('provider, tokens').eq('period', period),
      admin.from('llm_settings').select('provider, enabled, monthly_token_limit'),
    ])

    if (usageResult.error) {
      console.error('[LLM] 사용량 조회 실패:', usageResult.error.message)
    }
    if (settingsResult.error) {
      console.warn('[LLM] 설정 조회 실패, 기본값으로 처리합니다:', settingsResult.error.message)
    }

    const usage = new Map<string, number>(
      (usageResult.data ?? []).map(r => [String(r.provider), Number(r.tokens) || 0])
    )
    const settings = new Map<string, { enabled: boolean; limit: number }>(
      (settingsResult.data ?? []).map(r => [
        String(r.provider),
        {
          enabled: Boolean(r.enabled),
          limit: Number(r.monthly_token_limit ?? 1_000_000),
        },
      ])
    )

    for (const provider of LLM_PROVIDERS) {
      const s = settings.get(provider.name)
      const enabled = s?.enabled ?? true
      const limit = s?.limit ?? 1_000_000
      const used = usage.get(provider.name) ?? 0

      if (!provider.isConfigured() || !enabled || used >= limit) continue

      console.log(`[LLM] provider=${provider.name} used=${used}/${limit}`)

      try {
        const result = await provider.complete(system, user)
        if (!result) continue

        const { error } = await admin.rpc('increment_llm_usage', {
          p_provider: provider.name,
          p_period: period,
          p_tokens: result.tokens,
          p_calls: 1,
        })
        if (error) {
          console.error(`[LLM] provider=${provider.name} 사용량 기록 실패:`, error.message)
        }

        return result.text
      } catch (err) {
        console.error(
          `[LLM] provider=${provider.name} 호출 실패:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  } catch (err) {
    console.error('[LLM] 처리 실패:', err instanceof Error ? err.message : String(err))
  }

  return null
}
