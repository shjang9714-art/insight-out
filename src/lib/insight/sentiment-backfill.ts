import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifySentiment } from '@/lib/insight/sentiment'

export interface BackfillSentimentOpts {
  days?: number
  max?: number
  deadline?: number
}

export interface BackfillSentimentResult {
  analyzed: number
  candidates: number
  nullCount: number
  reason?: string
}

/**
 * 추적 엔티티(경쟁사 + mention 상위) 관련 최근 기사의 sentiment 백필.
 * 경쟁사 한정 → 범위 확대(C4). 키/후보 없으면 graceful(0 반환).
 */
export async function backfillSentiment(
  admin: SupabaseClient,
  opts: BackfillSentimentOpts = {},
): Promise<BackfillSentimentResult> {
  const days = Math.max(1, opts.days ?? 14)
  const max = Math.max(1, Math.min(opts.max ?? 40, 100))
  const deadline = opts.deadline

  // 1. 추적 엔티티 이름 (경쟁사 OR mention_count>=3) — 범위 확대 핵심
  const { data: entRows } = await admin
    .from('entities')
    .select('canonical_name, is_competitor, mention_count')
    .or('is_competitor.eq.true,mention_count.gte.3')
    .limit(100)

  const names = (entRows ?? [])
    .map((e: { canonical_name: string }) => e.canonical_name)
    .filter(Boolean)
  if (names.length === 0) {
    return { analyzed: 0, candidates: 0, nullCount: 0, reason: '추적 엔티티 미등록' }
  }

  // 2. 후보 (published·sentiment null·recent·matched_keywords ∩ names)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString()
  const { data: candidates } = await admin
    .from('contents')
    .select('id, title, summary_ko, body_original')
    .eq('status', 'published')
    .is('sentiment', null)
    .gte('collected_at', since)
    .overlaps('matched_keywords', names)
    .order('collected_at', { ascending: false })
    .limit(max)

  const rows = (candidates ?? []) as {
    id: string; title: string; summary_ko: string | null; body_original: string | null
  }[]
  if (rows.length === 0) return { analyzed: 0, candidates: 0, nullCount: 0 }

  // 3. 순차 classify → update (deadline 인지)
  let analyzed = 0, nullCount = 0
  for (const row of rows) {
    if (deadline && Date.now() >= deadline) break
    const snippet = row.summary_ko ?? row.body_original?.slice(0, 300) ?? row.title
    const result = await classifySentiment(row.title, snippet)
    if (!result) { nullCount++; continue }
    const { error } = await admin.from('contents').update({ sentiment: result }).eq('id', row.id)
    if (!error) analyzed++
  }

  return { analyzed, candidates: rows.length, nullCount }
}
