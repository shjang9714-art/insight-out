import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface OpsSettings {
  brief_recipients: string[]
  tts_monthly_char_cap: number | null
  translation_monthly_char_cap: number | null
  briefing_top_n: number | null
  briefing_min_articles: number | null
  briefing_window_hours: number | null
  briefing_host_name: string | null
}

const FALLBACK: OpsSettings = {
  brief_recipients: (process.env.OPS_BRIEF_RECIPIENTS ?? '').split(',').map((v) => v.trim()).filter(Boolean),
  tts_monthly_char_cap: Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 900_000),
  translation_monthly_char_cap: Number(process.env.TRANSLATION_MONTHLY_CHAR_CAP ?? 1_000_000),
  briefing_top_n: null,
  briefing_min_articles: null,
  briefing_window_hours: null,
  briefing_host_name: process.env.BRIEFING_HOST_NAME ?? null,
}

export async function getOpsSettings(): Promise<OpsSettings> {
  try {
    const { data, error } = await createAdminClient().from('ops_settings').select('brief_recipients, tts_monthly_char_cap, translation_monthly_char_cap, briefing_top_n, briefing_min_articles, briefing_window_hours, briefing_host_name').eq('id', true).maybeSingle()
    if (error || !data) return FALLBACK
    return {
      brief_recipients: data.brief_recipients ?? FALLBACK.brief_recipients,
      tts_monthly_char_cap: data.tts_monthly_char_cap ?? FALLBACK.tts_monthly_char_cap,
      translation_monthly_char_cap: data.translation_monthly_char_cap ?? FALLBACK.translation_monthly_char_cap,
      briefing_top_n: data.briefing_top_n ?? FALLBACK.briefing_top_n,
      briefing_min_articles: data.briefing_min_articles ?? FALLBACK.briefing_min_articles,
      briefing_window_hours: data.briefing_window_hours ?? FALLBACK.briefing_window_hours,
      briefing_host_name: data.briefing_host_name ?? FALLBACK.briefing_host_name,
    }
  } catch { return FALLBACK }
}
