import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import deeplProvider from '@/lib/translate/providers/deepl'
import googleProvider from '@/lib/translate/providers/google-unofficial'
import papagoProvider from '@/lib/translate/providers/papago'
import type { TranslateProvider } from '@/lib/translate/types'

export const TRANSLATION_SEPARATOR = '\n\n__INSIGHT_OUT_BODY_7F3A__\n\n'

export const TRANSLATION_PROVIDERS: TranslateProvider[] = [
  deeplProvider,
  papagoProvider,
  googleProvider,
]

export function getKstPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export async function translateToKorean(text: string): Promise<string | null> {
  if (!text.trim()) return null

  try {
    const admin = createAdminClient()
    const period = getKstPeriod()
    const [usageResult, settingsResult] = await Promise.all([
      admin
        .from('translation_usage')
        .select('provider, chars')
        .eq('period', period),
      admin
        .from('translation_settings')
        .select('provider, enabled'),
    ])

    if (usageResult.error) {
      console.error('[번역] 사용량 조회 실패:', usageResult.error.message)
      return null
    }

    const usage = new Map<string, number>(
      (usageResult.data ?? []).map((row) => [
        String(row.provider),
        Number(row.chars) || 0,
      ])
    )
    const enabledSettings = new Map<string, boolean>(
      (settingsResult.data ?? []).map((row) => [
        String(row.provider),
        Boolean(row.enabled),
      ])
    )

    if (settingsResult.error) {
      console.warn(
        '[번역] 활성 설정 조회 실패, 모든 공급자를 활성 상태로 처리합니다.:',
        settingsResult.error.message
      )
    }

    for (const provider of TRANSLATION_PROVIDERS) {
      const monthUsed = usage.get(provider.name) ?? 0
      const isEnabled = enabledSettings.get(provider.name) ?? true
      if (
        !provider.isConfigured() ||
        !isEnabled ||
        monthUsed + text.length > provider.monthlyCharLimit
      ) {
        continue
      }

      console.log(
        `[번역] provider=${provider.name} chars=${text.length} month_used=${monthUsed}`
      )

      try {
        const result = await provider.translate(text)
        if (!result) continue

        const { error: incrementError } = await admin.rpc(
          'increment_translation_usage',
          {
            p_provider: provider.name,
            p_period: period,
            p_chars: result.chars,
          }
        )

        if (incrementError) {
          console.error(
            `[번역] provider=${provider.name} 사용량 기록 실패:`,
            incrementError.message
          )
          continue
        }

        return result.text
      } catch (providerError) {
        console.error(
          `[번역] provider=${provider.name} 호출 실패:`,
          providerError instanceof Error
            ? providerError.message
            : String(providerError)
        )
      }
    }
  } catch (error) {
    console.error(
      '[번역] 처리 실패:',
      error instanceof Error ? error.message : String(error)
    )
  }

  return null
}
