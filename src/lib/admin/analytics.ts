import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { LLM_PROVIDERS } from '@/lib/llm'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'

const CATEGORIES = ['뉴스', '웹인사이트', '유튜브', '리포트', 'AI보고서'] as const
const STATUSES = ['pending', 'published', 'rejected'] as const
const DAILY_SAMPLE_LIMIT = 50_000
const SOURCE_SAMPLE_LIMIT = 20_000

// ── 콘텐츠 분석 ──────────────────────────────────────────────────────────────

export interface ContentAnalytics {
  windowDays: number
  daily: { date: string; count: number }[]
  byCategory: { category: string; count: number }[]
  byStatus: { status: string; count: number }[]
  topSources: { name: string; count: number }[]
  topBookmarked: { id: string; title: string; bookmark_count: number }[]
  totalInWindow: number
  truncated: boolean
}

function kstDateLabel(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`
}

export async function gatherContentAnalytics(admin: SupabaseClient, windowDays: number): Promise<ContentAnalytics> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: rows, count: totalInWindow }, { data: sourceRows }, { data: bookmarkRows }] = await Promise.all([
    admin
      .from('contents')
      .select('collected_at, category, status', { count: 'exact' })
      .gte('collected_at', windowStart)
      .limit(DAILY_SAMPLE_LIMIT),
    admin
      .from('contents')
      .select('source_id, sources(name)')
      .gte('collected_at', windowStart)
      .not('source_id', 'is', null)
      .limit(SOURCE_SAMPLE_LIMIT),
    admin
      .from('contents')
      .select('id, title, bookmark_count')
      .gt('bookmark_count', 0)
      .order('bookmark_count', { ascending: false })
      .limit(10),
  ])

  type ContentRow = { collected_at: string; category: string; status: string }
  const dailyMap = new Map<string, number>()
  const categoryMap = new Map<string, number>()
  const statusMap = new Map<string, number>()
  for (const row of (rows ?? []) as ContentRow[]) {
    const label = kstDateLabel(row.collected_at)
    dailyMap.set(label, (dailyMap.get(label) ?? 0) + 1)
    categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + 1)
    statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1)
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const byCategory = CATEGORIES.map(category => ({ category, count: categoryMap.get(category) ?? 0 }))
  const byStatus = STATUSES.map(status => ({ status, count: statusMap.get(status) ?? 0 }))

  type SourceRow = { source_id: string | null; sources: { name: string } | { name: string }[] | null }
  const sourceCounts = new Map<string, number>()
  for (const row of (sourceRows ?? []) as SourceRow[]) {
    const src = row.sources
    const name = Array.isArray(src) ? src[0]?.name : (src as { name: string } | null)?.name
    if (!name) continue
    sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1)
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  const topBookmarked = ((bookmarkRows ?? []) as { id: string; title: string; bookmark_count: number }[]).map(r => ({
    id: r.id,
    title: r.title,
    bookmark_count: r.bookmark_count ?? 0,
  }))

  return {
    windowDays,
    daily,
    byCategory,
    byStatus,
    topSources,
    topBookmarked,
    totalInWindow: totalInWindow ?? rows?.length ?? 0,
    truncated: (rows?.length ?? 0) >= DAILY_SAMPLE_LIMIT,
  }
}

// ── AI 사용량·비용 ───────────────────────────────────────────────────────────

export interface AiCostAnalytics {
  months: string[]
  llmByMonth: { period: string; provider: string; tokens: number }[]
  currentUsage: { provider: string; used: number; limit: number; percent: number }[]
  translationByMonth: { period: string; chars: number }[]
  ttsByMonth: { period: string; chars: number }[]
}

function recentMonths(count: number): string[] {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST 보정
  const months: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function gatherAiCostAnalytics(admin: SupabaseClient, months: number): Promise<AiCostAnalytics> {
  const periods = recentMonths(months)
  const currentPeriod = periods[periods.length - 1]

  const [{ data: llmRows }, { data: settingsRows }, { data: translationRows }, { data: ttsRows }] = await Promise.all([
    admin.from('llm_usage').select('provider, tokens, period').in('period', periods),
    admin.from('llm_settings').select('provider, monthly_token_limit'),
    admin.from('translation_usage').select('chars, period').in('period', periods),
    admin.from('tts_usage').select('chars, period').in('period', periods),
  ])

  const llmByMonth = ((llmRows ?? []) as { provider: string; tokens: number; period: string }[]).map(r => ({
    period: r.period,
    provider: r.provider,
    tokens: r.tokens ?? 0,
  }))

  const settingsMap = new Map<string, number>(
    ((settingsRows ?? []) as { provider: string; monthly_token_limit: number }[]).map(r => [r.provider, r.monthly_token_limit ?? 1_000_000])
  )
  const currentUsageMap = new Map<string, number>()
  for (const row of llmByMonth) {
    if (row.period !== currentPeriod) continue
    currentUsageMap.set(row.provider, (currentUsageMap.get(row.provider) ?? 0) + row.tokens)
  }
  const currentUsage = LLM_PROVIDERS.map(provider => {
    const keyCount = getProviderKeyCount(provider)
    const limit = (settingsMap.get(provider.name) ?? 1_000_000) * Math.max(keyCount, 1)
    const used = currentUsageMap.get(provider.name) ?? 0
    return {
      provider: provider.name,
      used,
      limit,
      percent: limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0,
    }
  })

  const translationMap = new Map<string, number>()
  for (const row of (translationRows ?? []) as { chars: number; period: string }[]) {
    translationMap.set(row.period, (translationMap.get(row.period) ?? 0) + (row.chars ?? 0))
  }
  const translationByMonth = periods.map(period => ({ period, chars: translationMap.get(period) ?? 0 }))

  const ttsMap = new Map<string, number>()
  for (const row of (ttsRows ?? []) as { chars: number; period: string }[]) {
    ttsMap.set(row.period, (ttsMap.get(row.period) ?? 0) + (row.chars ?? 0))
  }
  const ttsByMonth = periods.map(period => ({ period, chars: ttsMap.get(period) ?? 0 }))

  return { months: periods, llmByMonth, currentUsage, translationByMonth, ttsByMonth }
}
