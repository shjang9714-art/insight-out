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

export function recentMonths(count: number): string[] {
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

// ── 발행 분석 ────────────────────────────────────────────────────────────────

export interface PublishAnalytics {
  months: string[]
  byMonth: { period: string; strategyReports: number; briefings: number; newsletters: number; competitorWeekly: number }[]
  successRate: {
    strategy: { completed: number; failed: number }
    briefings: { ok: number; failed: number }
  }
  leadTime: { strategyAvgHours: number | null; briefingAvgHours: number | null }
  newsletter: { period: string; issues: number; recipients: number }[]
}

const LEAD_TIME_SAMPLE_LIMIT = 2000

function periodOf(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

function avgHours(pairs: { start: string; end: string }[]): number | null {
  if (!pairs.length) return null
  const totalHours = pairs.reduce((sum, p) => sum + (new Date(p.end).getTime() - new Date(p.start).getTime()) / (60 * 60 * 1000), 0)
  return Math.round((totalHours / pairs.length) * 10) / 10
}

export async function gatherPublishAnalytics(admin: SupabaseClient, months: number): Promise<PublishAnalytics> {
  const periods = recentMonths(months)
  const windowStart = new Date(`${periods[0]}-01T00:00:00.000Z`).toISOString()

  const [strategyRes, briefingRes, newsletterRes, competitorRes, strategyLeadRes, briefingLeadRes] = await Promise.all([
    admin.from('ai_reports').select('status, published_at, created_at').gte('created_at', windowStart),
    admin.from('briefings').select('status, generated_at, published_at, error_reason').gte('generated_at', windowStart),
    admin.from('newsletter_issues').select('sent_on, recipient_cnt, status').gte('sent_on', windowStart),
    admin.from('competitor_weekly_reports').select('week_start, status, generated_at').gte('week_start', windowStart),
    admin.from('ai_reports').select('created_at, published_at').not('published_at', 'is', null).gte('created_at', windowStart).limit(LEAD_TIME_SAMPLE_LIMIT),
    admin.from('briefings').select('generated_at, published_at').not('published_at', 'is', null).not('generated_at', 'is', null).gte('generated_at', windowStart).limit(LEAD_TIME_SAMPLE_LIMIT),
  ])

  const byMonthMap = new Map<string, { strategyReports: number; briefings: number; newsletters: number; competitorWeekly: number }>()
  for (const period of periods) byMonthMap.set(period, { strategyReports: 0, briefings: 0, newsletters: 0, competitorWeekly: 0 })

  type StrategyRow = { status: string; published_at: string | null; created_at: string }
  const strategyRows = (strategyRes.error ? [] : strategyRes.data ?? []) as StrategyRow[]
  for (const row of strategyRows) {
    if (!row.published_at) continue
    const bucket = byMonthMap.get(periodOf(row.published_at))
    if (bucket) bucket.strategyReports++
  }
  const strategyCompleted = strategyRows.filter(r => r.status === 'completed').length
  const strategyFailed = strategyRows.filter(r => r.status === 'failed').length

  type BriefingRow = { status: string; generated_at: string | null; published_at: string | null; error_reason: string | null }
  const briefingRows = (briefingRes.error ? [] : briefingRes.data ?? []) as BriefingRow[]
  for (const row of briefingRows) {
    const label = row.published_at ?? row.generated_at
    if (!label) continue
    const bucket = byMonthMap.get(periodOf(label))
    if (bucket) bucket.briefings++
  }
  const briefingOk = briefingRows.filter(r => r.status === 'published').length
  const briefingFailed = briefingRows.filter(r => r.status === 'failed').length

  type NewsletterRow = { sent_on: string; recipient_cnt: number; status: string }
  const newsletterRows = (newsletterRes.error ? [] : newsletterRes.data ?? []) as NewsletterRow[]
  const newsletterMap = new Map<string, { issues: number; recipients: number }>()
  for (const period of periods) newsletterMap.set(period, { issues: 0, recipients: 0 })
  for (const row of newsletterRows) {
    if (row.status !== 'sent') continue
    const period = periodOf(row.sent_on)
    const bucket = byMonthMap.get(period)
    if (bucket) bucket.newsletters++
    const nBucket = newsletterMap.get(period)
    if (nBucket) {
      nBucket.issues++
      nBucket.recipients += row.recipient_cnt ?? 0
    }
  }

  type CompetitorRow = { week_start: string; status: string; generated_at: string }
  const competitorRows = (competitorRes.error ? [] : competitorRes.data ?? []) as CompetitorRow[]
  for (const row of competitorRows) {
    if (row.status !== 'published') continue
    const bucket = byMonthMap.get(periodOf(row.generated_at ?? row.week_start))
    if (bucket) bucket.competitorWeekly++
  }

  const byMonth = periods.map(period => ({ period, ...byMonthMap.get(period)! }))
  const newsletter = periods.map(period => ({ period, ...newsletterMap.get(period)! }))

  const strategyLeadRows = (strategyLeadRes.error ? [] : strategyLeadRes.data ?? []) as { created_at: string; published_at: string }[]
  const briefingLeadRows = (briefingLeadRes.error ? [] : briefingLeadRes.data ?? []) as { generated_at: string; published_at: string }[]

  return {
    months: periods,
    byMonth,
    successRate: {
      strategy: { completed: strategyCompleted, failed: strategyFailed },
      briefings: { ok: briefingOk, failed: briefingFailed },
    },
    leadTime: {
      strategyAvgHours: avgHours(strategyLeadRows.map(r => ({ start: r.created_at, end: r.published_at }))),
      briefingAvgHours: avgHours(briefingLeadRows.map(r => ({ start: r.generated_at, end: r.published_at }))),
    },
    newsletter,
  }
}
