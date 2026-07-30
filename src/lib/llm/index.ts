import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import geminiProvider from '@/lib/llm/providers/gemini'
import groqProvider from '@/lib/llm/providers/groq'
import cerebrasProvider from '@/lib/llm/providers/cerebras'
import sambanovaProvider from '@/lib/llm/providers/sambanova'
import mistralProvider from '@/lib/llm/providers/mistral'
import openrouterProvider from '@/lib/llm/providers/openrouter'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  effectiveTokenLimit,
} from '@/lib/llm/token-limit'
import { LlmRateLimitError, type LlmProvider, type LlmTask } from '@/lib/llm/types'

export type { LlmTask }

/** 고정 폴백 풀 — 라우팅 테이블 미적용/전부 실패 시 안전망 */
export const LLM_PROVIDERS: LlmProvider[] = [
  geminiProvider,
  groqProvider,
  cerebrasProvider,
  sambanovaProvider,
  mistralProvider,
  openrouterProvider,
]

const PROVIDER_MAP: Record<string, LlmProvider> = {
  gemini:      geminiProvider,
  groq:        groqProvider,
  cerebras:    cerebrasProvider,
  sambanova:   sambanovaProvider,
  mistral:     mistralProvider,
  openrouter:  openrouterProvider,
}

// 한도소진(429/401) provider 쿨다운 — warm 인스턴스 내 best-effort(콜드스타트 시 리셋, 무해).
const COOLDOWN_MS = 3 * 60 * 1000 // 3분
const cooldownUntil = new Map<string, number>()

function isOnCooldown(providerName: string): boolean {
  return (cooldownUntil.get(providerName) ?? 0) > Date.now()
}

interface SettingsEntry { enabled: boolean; limit: number }

// ── 재시도 설정 ──────────────────────────────────────────────────────────────
// 관찰: provider 가 일시적으로 무응답/5xx 반환 → 수 초 뒤 같은 provider 재호출하면 성공하는 경우多.
// provider.complete() 은 실패를 예외 대신 null 로 삼키는 구현이 대부분이라, null 도 재시도 대상으로 취급한다.
const RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 600

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

interface ProviderAttempt {
  result: { text: string; tokens: number } | null
  /** 마지막 시도 실패 원인 (성공 시 null) */
  errorReason: string | null
  /** true 면 429/401 한도소진 — 같은 provider 재시도 없이 즉시 종료됨(호출부가 쿨다운 설정) */
  hardLimit: boolean
}

async function completeWithRetry(
  provider: LlmProvider,
  system: string,
  user: string,
  model?: string
): Promise<ProviderAttempt> {
  let lastReason: string | null = null

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await provider.complete(system, user, model)
      if (result) return { result, errorReason: null, hardLimit: false }
      lastReason = `${provider.name}: 응답 없음`
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        return { result: null, errorReason: `${provider.name}: 한도소진(429/401)`, hardLimit: true }
      }
      lastReason = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
    }

    if (attempt < RETRY_ATTEMPTS) {
      console.warn(`[LLM] provider=${provider.name} 시도 ${attempt}/${RETRY_ATTEMPTS} 실패(${lastReason}), ${RETRY_DELAY_MS * attempt}ms 후 재시도`)
      await sleep(RETRY_DELAY_MS * attempt)
    }
  }

  return { result: null, errorReason: lastReason, hardLimit: false }
}

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

export interface LlmCompleteResult {
  text: string | null
  /** 모든 provider 시도가 실패했을 때 마지막 실패 원인. 성공 시 null */
  errorReason: string | null
}

export interface LlmCompleteOptions {
  /** false면 task 라우팅 실패 후 고정 provider 풀을 순회하지 않는다. */
  allowFallbackPool?: boolean
}

/**
 * LLM 완성 호출 — task 별 DB 라우팅 → 실패 시 고정 폴백 풀.
 * 실패 원인까지 필요하면 {@link llmCompleteDetailed} 사용.
 * @param task  'classify' | 'summarize' | 'report'
 * @returns 응답 텍스트 또는 null (호출부는 결정적 폴백)
 */
export async function llmComplete(
  task: LlmTask,
  system: string,
  user: string,
  options?: LlmCompleteOptions
): Promise<string | null> {
  const { text } = await llmCompleteDetailed(task, system, user, options)
  return text
}

/**
 * llmComplete() 과 동일하나, 실패 시 마지막 실패 원인을 함께 반환한다.
 */
export async function llmCompleteDetailed(
  task: LlmTask,
  system: string,
  user: string,
  options: LlmCompleteOptions = {}
): Promise<LlmCompleteResult> {
  const { allowFallbackPool = true } = options
  let lastErrorReason: string | null = null

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
        {
          enabled: Boolean(r.enabled),
          limit: Number(r.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT),
        },
      ])
    )

    // ── 1단계: DB 라우팅 테이블 순서대로 시도 ────────────────────────────
    if (!routingResult.error && (routingResult.data ?? []).length > 0) {
      for (const route of routingResult.data!) {
        const provider = PROVIDER_MAP[route.provider]
        if (!provider?.isConfigured()) continue
        if (isOnCooldown(route.provider)) continue

        const s = settings.get(route.provider)
        if (s?.enabled === false) continue
        const tokenLimit = effectiveTokenLimit(s?.limit, getProviderKeyCount(provider))
        if ((usage.get(route.provider) ?? 0) >= tokenLimit) continue

        console.log(`[LLM] task=${task} provider=${route.provider} model=${route.model_id}`)
        const { result, errorReason, hardLimit } = await completeWithRetry(provider, system, user, route.model_id)
        if (!result) {
          lastErrorReason = errorReason
          console.error(`[LLM] task=${task} provider=${route.provider} 호출 실패:`, errorReason)
          if (hardLimit) cooldownUntil.set(route.provider, Date.now() + COOLDOWN_MS)
          continue
        }

        await incrementUsage(admin, route.provider, period, result.tokens)
        return { text: result.text, errorReason: null }
      }
    } else if (routingResult.error) {
      lastErrorReason = `라우팅 조회 실패: ${routingResult.error.message}`
      console.warn(
        allowFallbackPool
          ? '[LLM] 라우팅 테이블 조회 실패, 고정 폴백 사용:'
          : '[LLM] 라우팅 테이블 조회 실패, 폴백 비활성:',
        routingResult.error.message
      )
    }

    if (!allowFallbackPool) {
      return {
        text: null,
        errorReason: lastErrorReason ?? '활성 라우팅 없음',
      }
    }

    // ── 2단계: 고정 폴백 풀 (라우팅 전부 실패 / 테이블 없음 시 안전망) ──
    for (const provider of LLM_PROVIDERS) {
      const s = settings.get(provider.name)
      if (!provider.isConfigured() || s?.enabled === false) continue
      if (isOnCooldown(provider.name)) continue
      const tokenLimit = effectiveTokenLimit(s?.limit, getProviderKeyCount(provider))
      if ((usage.get(provider.name) ?? 0) >= tokenLimit) continue

      console.log(`[LLM] fallback provider=${provider.name}`)
      const { result, errorReason, hardLimit } = await completeWithRetry(provider, system, user)
      if (!result) {
        lastErrorReason = errorReason
        console.error(`[LLM] fallback provider=${provider.name} 호출 실패:`, errorReason)
        if (hardLimit) cooldownUntil.set(provider.name, Date.now() + COOLDOWN_MS)
        continue
      }

      await incrementUsage(admin, provider.name, period, result.tokens)
      return { text: result.text, errorReason: null }
    }
  } catch (err) {
    lastErrorReason = `내부 오류: ${err instanceof Error ? err.message : String(err)}`
    console.error('[LLM] 처리 실패:', lastErrorReason)
  }

  return { text: null, errorReason: lastErrorReason ?? '사용 가능한 provider 없음' }
}
