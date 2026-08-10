import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { summarizeYoutubeKo } from '@/lib/crawler/summarize'

export interface BackfillYoutubeSummaryOpts {
  max?: number
  deadline?: number
}

export interface BackfillYoutubeSummaryResult {
  analyzed: number
  candidates: number
  reason?: string
}

interface YoutubeRow {
  id: string
  title: string
  sources: { name: string } | { name: string }[] | null
}

/**
 * summary_ko 없는 유튜브 콘텐츠에 제목+채널명 기반 요약을 백필한다(266).
 * 태깅 백필(252)과 동일 패턴 — 어드민 트리거, deadline 인지, 실패해도 크래시 없음, 멱등.
 */
export async function backfillYoutubeSummary(
  admin: SupabaseClient,
  opts: BackfillYoutubeSummaryOpts = {},
): Promise<BackfillYoutubeSummaryResult> {
  const max = Math.max(1, Math.min(opts.max ?? 50, 200))
  const deadline = opts.deadline

  const { data: rows } = await admin
    .from('contents')
    .select('id, title, sources(name)')
    .eq('category', '유튜브')
    .eq('status', 'published')
    .is('summary_ko', null)
    .is('deleted_at', null)
    .order('collected_at', { ascending: false })
    .limit(max)

  const candidates = (rows ?? []) as YoutubeRow[]

  if (candidates.length === 0) {
    return { analyzed: 0, candidates: 0, reason: '요약 없는 유튜브 없음(이미 생성됨)' }
  }

  let analyzed = 0
  for (const row of candidates) {
    if (deadline && Date.now() >= deadline) break
    const sourcesField = row.sources
    const channelName = (Array.isArray(sourcesField) ? sourcesField[0]?.name : sourcesField?.name) ?? null
    try {
      const { text: summary } = await summarizeYoutubeKo(row.title, channelName)
      if (summary) {
        await admin.from('contents').update({ summary_ko: summary }).eq('id', row.id)
      }
    } catch (e) {
      console.error('[유튜브 요약 백필] 실패:', e)
    }
    analyzed++
  }

  return { analyzed, candidates: candidates.length }
}
