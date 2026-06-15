import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import geminiProvider from '@/lib/llm/providers/gemini'
import groqProvider from '@/lib/llm/providers/groq'
import cerebrasProvider from '@/lib/llm/providers/cerebras'
import openrouterProvider from '@/lib/llm/providers/openrouter'
import type { LlmProvider, LlmTask } from '@/lib/llm/types'

export type { LlmTask }

/** 고정 폴백 풀 — 라우팅 테이블 미적용/전부 실패 시 안전망 */
export const LLM_PROVIDERS: LlmProvider[] = [
  geminiProvider,
  groqProvider,
  cerebrasProvider,
  openrouterProvider,
]

const PROVIDER_MAP: Record<string, LlmProvider> = {
  gemini:      geminiProvider,
  groq:        groqProvider,
  cerebras:    cerebrasProvider,
  openrouter:  openrouterProvider,
}

interface SettingsEntry { enabled: boolean; limit: number }

async function incrementUsage(
  admin: ReturnType<typeof createAdminClient>,
  provider: string,
  period: string,
  tokens: number
) {
  const { error } = await admin.rpc('increment_llm_usage', {
    p_provider: provider,
    p_period: period,
    p_tokens: tokens,
    p_calls: 1,
  })
  if (error) console.error(`[LLM] 사용량 기록 실패 provider=${provider}:`, error.message)
}

/**
 * LLM 완성 호출 — task 별 DB 라우팅 → 실패 시 고정 폴백 풀.
 * @param task  'classify' | 'summarize' | 'report'
 * @returns 응답 텍스트 또는 null (호출부는 결정적 폴백)
 */
export async function llmComplete(
  task: LlmTask,
  system: string,
  user: string
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const period = getKstPeriod()

    const [routingResult, usageResult, settingsResult] = await Promise.all([
      admin
        .from('llm_task_routing')
        .select('provider, model_id')
        .eq('task_type', task)
        .eq('is_active', true)
        .order('priority', { ascending: true }),
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
    const settings = new Map<string, SettingsEntry>(
      (settingsResult.data ?? []).map(r => [
        String(r.provider),
        { enabled: Boolean(r.enabled), limit: Number(r.monthly_token_limit ?? 1_000_000) },
      ])
    )

    // ── 1단계: DB 라우팅 테이블 순서대로 시도 ────────────────────────────
    if (!routingResult.error && (routingResult.data ?? []).length > 0) {
      for (const route of routingResult.data!) {
        const provider = PROVIDER_MAP[route.provider]
        if (!provider?.isConfigured()) continue

        const s = settings.get(route.provider)
        if (s?.enabled === false) continue
        if ((usage.get(route.provider) ?? 0) >= (s?.limit ?? 1_000_000)) continue

        console.log(`[LLM] task=${task} provider=${route.provider} model=${route.model_id}`)
        try {
          const result = await provider.complete(system, user, route.model_id)
          if (!result) continue

          await incrementUsage(admin, route.provider, period, result.tokens)
          return result.text
        } catch (err) {
          console.error(
            `[LLM] task=${task} provider=${route.provider} 호출 실패:`,
            err instanceof Error ? err.message : String(err)
          )
        }
      }
    } else if (routingResult.error) {
      console.warn('[LLM] 라우팅 테이블 조회 실패, 고정 폴백 사용:', routingResult.error.message)
    }

    // ── 2단계: 고정 폴백 풀 (라우팅 전부 실패 / 테이블 없음 시 안전망) ──
    for (const provider of LLM_PROVIDERS) {
      const s = settings.get(provider.name)
      if (!provider.isConfigured() || s?.enabled === false) continue
      if ((usage.get(provider.name) ?? 0) >= (s?.limit ?? 1_000_000)) continue

      console.log(`[LLM] fallback provider=${provider.name}`)
      try {
        const result = await provider.complete(system, user)
        if (!result) continue

        await incrementUsage(admin, provider.name, period, result.tokens)
        return result.text
      } catch (err) {
        console.error(
          `[LLM] fallback provider=${provider.name} 호출 실패:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  } catch (err) {
    console.error('[LLM] 처리 실패:', err instanceof Error ? err.message : String(err))
  }

  return null
}
