import { createAdminClient } from '@/lib/supabase/admin'
import deeplProvider from '@/lib/translate/providers/deepl'
import googleProvider from '@/lib/translate/providers/google-unofficial'
import papagoProvider from '@/lib/translate/providers/papago'
import type { TranslateProvider } from '@/lib/translate/types'

export const TRANSLATION_SEPARATOR = '\n\n__INSIGHT_OUT_BODY_7F3A__\n\n'

const PROVIDERS: TranslateProvider[] = [
  deeplProvider,
  papagoProvider,
  googleProvider,
]

function getKstPeriod(): string {
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
    const { data, error } = await admin
      .from('translation_usage')
      .select('provider, chars')
      .eq('period', period)

    if (error) {
      console.error('[번역] 사용량 조회 실패:', error.message)
      return null
    }

    const usage = new Map<string, number>(
      (data ?? []).map((row) => [
        String(row.provider),
        Number(row.chars) || 0,
      ])
    )

    for (const provider of PROVIDERS) {
      const monthUsed = usage.get(provider.name) ?? 0
      if (
        !provider.isConfigured() ||
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
