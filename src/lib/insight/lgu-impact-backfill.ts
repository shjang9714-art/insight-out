import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyLguImpact } from '@/lib/insight/lgu-impact'

export interface BackfillLguImpactOpts {
  days?: number
  max?: number
  deadline?: number
}

export interface BackfillLguImpactResult {
  analyzed: number
  candidates: number
  nullCount: number
  reason?: string
}

/**
 * 경쟁사 관련 최근 기사의 lgu_impact(LG U+ 관점 위기/기회/관망) 백필.
 * 경쟁사 한정(is_competitor=true) — sentiment 백필의 mention 확대 범위는 제외.
 * `lgu_impact` 컬럼 미적용(241 SQL 전) 시 42703 → graceful 0 반환.
 */
export async function backfillLguImpact(
  admin: SupabaseClient,
  opts: BackfillLguImpactOpts = {},
): Promise<BackfillLguImpactResult> {
  const days = Math.max(1, opts.days ?? 14)
  const max = Math.max(1, Math.min(opts.max ?? 40, 100))
  const deadline = opts.deadline

  // 1. 경쟁사 엔티티 이름
  const { data: entRows } = await admin
    .from('entities')
    .select('canonical_name')
    .eq('is_competitor', true)
    .limit(100)

  const names = (entRows ?? [])
    .map((e: { canonical_name: string }) => e.canonical_name)
    .filter(Boolean)
  if (names.length === 0) {
    return { analyzed: 0, candidates: 0, nullCount: 0, reason: '경쟁사 엔티티 미등록' }
  }

  // 2. 후보 (published·lgu_impact null·recent·matched_keywords ∩ names)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString()
  const { data: candidates, error: candidatesError } = await admin
    .from('contents')
    .select('id, title, summary_ko, body_original, matched_keywords')
    .eq('status', 'published')
    .is('lgu_impact', null)
    .gte('collected_at', since)
    .overlaps('matched_keywords', names)
    .order('collected_at', { ascending: false })
    .limit(max)

  if (candidatesError) {
    if (candidatesError.code === '42703') {
      return { analyzed: 0, candidates: 0, nullCount: 0, reason: 'lgu_impact 컬럼 미적용' }
    }
    return { analyzed: 0, candidates: 0, nullCount: 0, reason: candidatesError.message }
  }

  const rows = (candidates ?? []) as {
    id: string
    title: string
    summary_ko: string | null
    body_original: string | null
    matched_keywords: string[] | null
  }[]
  if (rows.length === 0) return { analyzed: 0, candidates: 0, nullCount: 0 }

  // 3. 순차 classify → update (deadline 인지)
  let analyzed = 0, nullCount = 0
  for (const row of rows) {
    if (deadline && Date.now() >= deadline) break
    const snippet = row.summary_ko ?? row.body_original?.slice(0, 300) ?? row.title
    const competitors = (row.matched_keywords ?? []).filter(k => names.includes(k))
    const result = await classifyLguImpact(row.title, snippet, competitors)
    if (!result) { nullCount++; continue }
    const { error } = await admin.from('contents').update({ lgu_impact: result }).eq('id', row.id)
    if (!error) analyzed++
    else if (error.code === '42703') {
      return { analyzed, candidates: rows.length, nullCount, reason: 'lgu_impact 컬럼 미적용' }
    }
  }

  return { analyzed, candidates: rows.length, nullCount }
}
