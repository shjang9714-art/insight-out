import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStorageUrl } from '@/lib/storage/resolve-url'

export interface BriefingPlayerRow {
  id: string
  briefing_date: string
  title: string | null
  script: string | null
  audio_url: string | null
  audio_duration_seconds: number | null
}

export function resolveBriefingAudioUrl<T extends { audio_url: string | null }>(briefing: T): T {
  return {
    ...briefing,
    audio_url: resolveStorageUrl(briefing.audio_url),
  }
}

export async function getLatestPublishedBriefing(
  supabase: SupabaseClient,
): Promise<BriefingPlayerRow | null> {
  const { data } = await supabase
    .from('briefings')
    .select('id, briefing_date, title, script, audio_url, audio_duration_seconds')
    .in('status', ['published', 'archived'])
    .order('briefing_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? resolveBriefingAudioUrl(data as BriefingPlayerRow) : null
}
