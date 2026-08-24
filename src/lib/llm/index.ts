import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import geminiProvider from '@/lib/llm/providers/gemini'
import groqProvider from '@/lib/llm/providers/groq'
import cerebrasProvider from '@/lib/llm/providers/cerebras'
import sambanovaProvider from '@/lib/llm/providers/sambanova'
import mistralProvider from '@/lib/llm/providers/mistral'
import openrouterProvider from '@/lib/llm/providers/openrouter'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  monthlyBudget,
} from '@/lib/llm/token-limit'
import { LlmModelUnavailableError, LlmRateLimitError, type LlmProvider, type LlmTask } from '@/lib/llm/types'

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
// 429(분당 요청 제한)는 수십 초면 풀리므로 짧게, 401(인증 실패·키 만료)는 스스로 낫지 않으므로 길게 유지.
const RATE_COOLDOWN_MS = 30 * 1000       // 429
const AUTH_COOLDOWN_MS = 3 * 60 * 1000   // 401
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
  /** true 면 404/400 모델 영구 사용 불가 — 모델 문제이지 한도 문제가 아니므로 쿨다운을 걸지 않는다 */
  permanent: boolean
  /** hardLimit이 true일 때만 의미 있음. 쿨다운 길이 결정에 사용(rate=30초, auth=3분) */
  cooldownKind?: 'rate' | 'auth'
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
      if (result) return { result, errorReason: null, hardLimit: false, permanent: false }
      lastReason = `${provider.name}: 응답 없음`
    } catch (err) {
      if (err instanceof LlmModelUnavailableError) {
        // 404/400/422는 같은 모델을 다시 불러도 결과가 같다 — 재시도하지 않고 즉시 종료.
        // 404의 사유 문자열은 detect-issues.ts:243 이 부분 일치로 읽는 계약 — 절대 바꾸지 마라.
        const reasonLabel = err.status === 404 ? '모델 사용 불가(404)' : `요청 거부(${err.status})`
        return {
          result: null,
          errorReason: `${provider.name}: ${reasonLabel}`,
          hardLimit: false,
          permanent: true,
        }
      }
      if (err instanceof LlmRateLimitError) {
        const reasonLabel =
          err.status === 429 ? '한도소진(429)' :
          err.status === 401 ? '인증실패(401, 키 점검 필요)' :
          // 402의 사유 문자열은 summarize.ts:16 이 '한도소진' 부분 일치로 읽는 계약 — '한도소진' 문구 필수.
          err.status === 402 ? '결제 한도소진(402, 크레딧 점검 필요)' :
          err.status === 403 ? '권한 거부(403, 키 점검 필요)' :
          err.status !== undefined && err.status >= 500 && err.status <= 599 ? `서버 오류(${err.status})` :
          err.kind === 'auth' ? '인증실패(401, 키 점검 필요)' : '한도소진(429)'
        return {
          result: null,
          errorReason: `${provider.name}: ${reasonLabel}`,
          hardLimit: true,
          permanent: false,
          cooldownKind: err.kind,
        }
      }
      lastReason = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
    }

    if (attempt < RETRY_ATTEMPTS) {
      console.warn(`[LLM] provider=${provider.name} 시도 ${attempt}/${RETRY_ATTEMPTS} 실패(${lastReason}), ${RETRY_DELAY_MS * attempt}ms 후 재시도`)
      await sleep(RETRY_DELAY_MS * attempt)
    }
  }

  return { result: null, errorReason: lastReason, hardLimit: false, permanent: false }
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

async function updateRoutingModelHealth(
  admin: ReturnType<typeof createAdminClient>,
  task: LlmTask,
  priority: number,
  provider: string,
  modelId: string,
  errorMessage: string | null
) {
  try {
    const { error } = await admin
      .from('llm_task_routing')
      .update({
        last_error: errorMessage,
        last_error_at: errorMessage ? new Date().toISOString() : null,
      })
      .eq('task_type', task)
      .eq('priority', priority)
      .eq('provider', provider)
      .eq('model_id', modelId)

    if (error) {
      console.error(
        `[LLM] 라우팅 모델 상태 기록 실패 task=${task} priority=${priority}:`,
        error.message
      )
    }
  } catch (err) {
    console.error(
      `[LLM] 라우팅 모델 상태 기록 실패 task=${task} priority=${priority}:`,
      err instanceof Error ? err.message : String(err)
    )
  }
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
        .select('priority, provider, model_id')
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
        if (isOnCooldown(route.provider)) {
          // 쿨다운으로 건너뛴 경우도 사유를 남긴다 — 안 남기면 최종 사유가
          // "활성 라우팅 없음"으로 잘못 보고된다(라우팅은 멀쩡한데 쿨다운 중일 뿐인데도).
          lastErrorReason = `${route.provider}: 쿨다운 중(429/401)`
          continue
        }

        const s = settings.get(route.provider)
        if (s?.enabled === false) continue
        const tokenLimit = monthlyBudget(s?.limit)
        if ((usage.get(route.provider) ?? 0) >= tokenLimit) continue

        console.log(`[LLM] task=${task} provider=${route.provider} model=${route.model_id}`)
        const { result, errorReason, hardLimit, permanent, cooldownKind } = await completeWithRetry(provider, system, user, route.model_id)
        if (!result) {
          lastErrorReason = errorReason
          if (permanent) {
            console.error(`[LLM] task=${task} provider=${route.provider} model=${route.model_id} 모델 사용 불가 — 라우팅 행 점검 필요`)
            // 404만 고정 문자열('모델 사용 불가(404)') 사용 — detect-issues.ts:243 계약. 400/422는 errorReason 그대로.
            await updateRoutingModelHealth(
              admin,
              task,
              route.priority,
              route.provider,
              route.model_id,
              errorReason?.includes('모델 사용 불가(404)')
                ? `${route.provider}: 모델 사용 불가(404) — ${route.model_id}`
                : errorReason
            )
          } else {
            console.error(`[LLM] task=${task} provider=${route.provider} 호출 실패:`, errorReason)
            await updateRoutingModelHealth(
              admin,
              task,
              route.priority,
              route.provider,
              route.model_id,
              errorReason
            )
          }
          // permanent(모델 문제)면 쿨다운을 걸지 않는다 — 다음 호출에도 같은 모델이면 계속 실패할 뿐, 시간이 지나도 안 풀린다.
          if (hardLimit) {
            const ms = cooldownKind === 'rate' ? RATE_COOLDOWN_MS : AUTH_COOLDOWN_MS
            cooldownUntil.set(route.provider, Date.now() + ms)
            if (cooldownKind === 'auth') {
              console.error(`[LLM] provider=${route.provider} 키 점검 필요 — ${ms / 1000}초 쿨다운`)
            }
          }
          continue
        }

        await updateRoutingModelHealth(
          admin,
          task,
          route.priority,
          route.provider,
          route.model_id,
          null
        )
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
      if (isOnCooldown(provider.name)) {
        lastErrorReason = `${provider.name}: 쿨다운 중(429/401)`
        continue
      }
      const tokenLimit = monthlyBudget(s?.limit)
      if ((usage.get(provider.name) ?? 0) >= tokenLimit) continue

      console.log(`[LLM] fallback provider=${provider.name}`)
      const { result, errorReason, hardLimit, permanent, cooldownKind } = await completeWithRetry(provider, system, user)
      if (!result) {
        lastErrorReason = errorReason
        if (permanent) {
          console.error(`[LLM] fallback provider=${provider.name} 모델 사용 불가 — 라우팅 행 점검 필요`)
        } else {
          console.error(`[LLM] fallback provider=${provider.name} 호출 실패:`, errorReason)
        }
        if (hardLimit) {
          const ms = cooldownKind === 'rate' ? RATE_COOLDOWN_MS : AUTH_COOLDOWN_MS
          cooldownUntil.set(provider.name, Date.now() + ms)
          if (cooldownKind === 'auth') {
            console.error(`[LLM] provider=${provider.name} 키 점검 필요 — ${ms / 1000}초 쿨다운`)
          }
        }
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
