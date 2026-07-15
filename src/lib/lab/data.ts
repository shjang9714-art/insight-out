import type { SupabaseClient } from '@supabase/supabase-js'
import { getKstTodayStartIso } from '@/lib/date'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import { tagTypeToBucket, type KeywordItem, type TagBucket } from '@/lib/tag-buckets'
import {
  computeIssueActivity,
  type ActivityRow,
  type IssueCard,
  type IssueRow,
} from '@/lib/issues/activity'
import type { InsightGroup, ContentMetaRecord } from '@/components/analysis/InsightCardsSectionClient'
import type { TopicTrend } from '@/components/analysis/AiInsightBoard'

// 실험실(관리자 전용) 페이지 전용 데이터 헬퍼.
// AiInsightsView.tsx 의 헤드라인/뜨는 토픽/이슈 타임라인 3개 탭에 필요한 부분만
// 별도로 패칭한다 — 운영 중인 AI 인사이트 페이지(AiInsightsView.tsx)는 건드리지 않음.

interface ContentMeta {
  title: string
  category: string | null
  sourceName: string | null
  matchedKeywords: string[] | null
}

// ─── 뜨는 토픽 집계 (AiInsightsView.tsx 와 동일 로직, 실험실 전용 복제) ──────────
function computeTrendingTopics(
  rows: { matched_groups: string[] | null; collected_at: string }[],
  todayStartMs: number,
  topN = 8,
): TopicTrend[] {
  const curMap: Record<string, number> = {}
  const prevMap: Record<string, number> = {}

  const thisWeekStart = todayStartMs - 6 * 24 * 60 * 60 * 1000
  const prevWeekStart = todayStartMs - 13 * 24 * 60 * 60 * 1000

  for (const row of rows ?? []) {
    if (!(row.matched_groups ?? []).length) continue
    const kstMs = new Date(row.collected_at).getTime() + 9 * 60 * 60 * 1000
    const isThisWeek = kstMs >= thisWeekStart + 9 * 60 * 60 * 1000
    const isPrevWeek = !isThisWeek && kstMs >= prevWeekStart + 9 * 60 * 60 * 1000
    for (const g of row.matched_groups ?? []) {
      if (isThisWeek) curMap[g]  = (curMap[g]  ?? 0) + 1
      if (isPrevWeek) prevMap[g] = (prevMap[g] ?? 0) + 1
    }
  }

  const results: TopicTrend[] = []
  for (const group of Object.keys(curMap)) {
    const cur  = curMap[group]  ?? 0
    const prev = prevMap[group] ?? 0
    if (cur === 0) continue
    const changePct = prev > 0 ? Math.round((cur - prev) / prev * 100) : null
    results.push({ group, cur, prev, changePct })
  }

  return results
    .sort((a, b) => {
      const aScore = a.changePct === null ? Infinity : a.changePct
      const bScore = b.changePct === null ? Infinity : b.changePct
      if (bScore !== aScore) return bScore - aScore
      return b.cur - a.cur
    })
    .filter(t => t.changePct === null || t.changePct >= 0)
    .slice(0, topN)
}

export interface LabData {
  insightGroups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  bucketByTopic: Record<string, TagBucket>
  trendingTopics: TopicTrend[]
  kwStrip: KeywordItem[]
  issueCards: IssueCard[]
  error?: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

function recordLabError(errors: string[], label: string, error: unknown): void {
  const normalizedError = error instanceof Error ? error : new Error(getErrorMessage(error))
  console.error(`[lab] ${label} 실패:`, normalizedError)
  errors.push(`${label}: ${normalizedError.message}`)
}

function createEmptyLabData(error?: string): LabData {
  return {
    insightGroups: [],
    contentMap: {},
    bucketByTopic: {},
    trendingTopics: [],
    kwStrip: [],
    issueCards: [],
    ...(error ? { error } : {}),
  }
}

export async function getLabData(supabase: SupabaseClient): Promise<LabData> {
  const errors: string[] = []

  try {
  const todayStart = getKstTodayStartIso()
  const todayStartMs = new Date(todayStart).getTime()
  const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

  type TrendRow = {
    matched_groups: string[] | null
    matched_keywords: string[] | null
    collected_at: string
  }
  type KgRow = { name: string; tag_type: string; include_patterns: string[] | null }

  const [cards, trendRows, keywordGroups, issueCards] = await Promise.all([
    (async (): Promise<InsightCard[]> => {
      try {
        const { data, error } = await supabase
          .from('insight_cards')
          .select('id, period_start, period_end, topic, headline, implication, source_content_ids, citations, generated_at')
          .eq('status', 'published')
          .eq('scope', 'industry')
          .order('period_start', { ascending: false })
          .order('generated_at', { ascending: false })
          .limit(30)
        if (error) throw error
        return (data ?? []) as InsightCard[]
      } catch (error) {
        recordLabError(errors, 'insight_cards', error)
        return []
      }
    })(),
    (async (): Promise<TrendRow[]> => {
      try {
        const { data, error } = await supabase
          .from('contents')
          .select('matched_groups, matched_keywords, collected_at')
          .eq('status', 'published')
          .gte('collected_at', fourteenDaysStart)
          .limit(1000)
        if (error) throw error
        return (data ?? []) as TrendRow[]
      } catch (error) {
        recordLabError(errors, 'contents trend', error)
        return []
      }
    })(),
    (async (): Promise<KgRow[]> => {
      try {
        const { data, error } = await supabase
          .from('keyword_groups')
          .select('name, tag_type, include_patterns')
          .eq('is_active', true)
          .limit(200)
        if (error) throw error
        return (data ?? []) as KgRow[]
      } catch (error) {
        recordLabError(errors, 'keyword_groups', error)
        return []
      }
    })(),
    (async (): Promise<IssueCard[]> => {
      let issues: IssueRow[] = []
      try {
        const { data, error } = await supabase
          .from('issues')
          .select('id, title, summary')
          .eq('status', 'published')
          .order('created_at', { ascending: false })
        if (error) throw error
        issues = (data ?? []) as IssueRow[]
      } catch (error) {
        recordLabError(errors, 'issues', error)
        return []
      }

      const issueIds = issues.map(issue => issue.id)
      if (issueIds.length === 0) return []

      try {
        const { data, error } = await supabase
          .from('issue_contents')
          .select('issue_id, contents!inner(collected_at, sentiment, matched_keywords, status)')
          .in('issue_id', issueIds)
          .eq('contents.status', 'published')
          .limit(5000)
        if (error) throw error
        return computeIssueActivity(issues, (data ?? []) as unknown as ActivityRow[])
      } catch (error) {
        recordLabError(errors, 'issue_contents', error)
        return computeIssueActivity(issues, [])
      }
    })(),
  ])
  const trendingTopics = computeTrendingTopics(
    trendRows ?? [],
    todayStartMs,
  )

  // ─── 키워드 방향 계산 ─────────────────────────────────────────────────────
  const kwFreq: Record<string, number> = {}
  const kwCurFreq: Record<string, number> = {}
  const kwPrevFreq: Record<string, number> = {}
  const thisWeekStartMs = todayStartMs - 6 * 24 * 60 * 60 * 1000
  const prevWeekStartMs = todayStartMs - 13 * 24 * 60 * 60 * 1000

  for (const row of trendRows ?? []) {
    if (!row.matched_keywords?.length) continue
    const kstMs = new Date(row.collected_at).getTime() + 9 * 60 * 60 * 1000
    const isThisWeek = kstMs >= thisWeekStartMs + 9 * 60 * 60 * 1000
    const isPrevWeek = !isThisWeek && kstMs >= prevWeekStartMs + 9 * 60 * 60 * 1000
    for (const kw of row.matched_keywords ?? []) {
      kwFreq[kw] = (kwFreq[kw] ?? 0) + 1
      if (isThisWeek) kwCurFreq[kw]  = (kwCurFreq[kw]  ?? 0) + 1
      if (isPrevWeek) kwPrevFreq[kw] = (kwPrevFreq[kw] ?? 0) + 1
    }
  }

  const TOP_KEYWORDS_N = 30
  const topKeywords = Object.entries(kwFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_KEYWORDS_N)
    .map(([name, count]) => ({ name, count }))

  // ─── 키워드 분류 ──────────────────────────────────────────────────────────
  const patternTagMap = new Map<string, string>()
  for (const g of keywordGroups ?? []) {
    const tagType = g.tag_type
    const gNameLower = g.name.toLowerCase()
    if (!patternTagMap.has(gNameLower) || patternTagMap.get(gNameLower) === 'industry') {
      patternTagMap.set(gNameLower, tagType)
    }
    for (const pat of (g.include_patterns ?? [])) {
      const lower = pat.toLowerCase()
      const existing = patternTagMap.get(lower)
      if (!existing || existing === 'industry') {
        patternTagMap.set(lower, tagType)
      }
    }
  }

  // ─── 토픽→버킷 매핑 ────────────────────────────────────────────────────────
  const bucketByTopic: Record<string, TagBucket> = {}
  for (const card of cards ?? []) {
    if (!card.topic) continue
    const tagType = patternTagMap.get(card.topic.toLowerCase())
    bucketByTopic[card.topic] = tagTypeToBucket(tagType)
  }

  const classifiedKeywords: KeywordItem[] = topKeywords.map(({ name, count }) => {
    const tagType = patternTagMap.get(name.toLowerCase())
    const bucket = tagTypeToBucket(tagType)
    const cur  = kwCurFreq[name]  ?? 0
    const prev = kwPrevFreq[name] ?? 0
    const direction: '▲' | '▽' | null = cur > prev ? '▲' : cur < prev ? '▽' : null
    return { name, count, size: 14, bucket, watched: false, isCompetitor: false, direction }
  })

  // ─── 인사이트 카드 그룹(헤드라인 분석용) ──────────────────────────────────
  const contentMap = new Map<string, ContentMeta>()
  if ((cards ?? []).length > 0) {
    const allIds = new Set<string>()
    for (const card of cards ?? []) {
      for (const id of card.source_content_ids ?? []) allIds.add(id)
      for (const citation of (card.citations ?? []) as InsightCardCitation[]) {
        if (citation.content_id) allIds.add(citation.content_id)
      }
    }
    if (allIds.size > 0) {
      try {
        const { data: contents, error } = await supabase
          .from('contents')
          .select('id, title, category, matched_keywords, sources(name)')
          .in('id', [...allIds])
        if (error) throw error
        for (const row of contents ?? []) {
          const content = row as unknown as {
            id: string
            title: string
            category: string | null
            matched_keywords: string[] | null
            sources: { name: string } | null
          }
          if (!content.id) continue
          contentMap.set(content.id, {
            title: content.title ?? '제목 없음',
            category: content.category,
            sourceName: content.sources?.name ?? null,
            matchedKeywords: content.matched_keywords ?? [],
          })
        }
      } catch (error) {
        recordLabError(errors, 'source contents', error)
      }
    }
  }

  // card_headline 보강
  if ((cards ?? []).length > 0) {
    try {
      const { data: chData, error } = await supabase
        .from('insight_cards')
        .select('id, card_headline')
        .in('id', (cards ?? []).map(card => card.id))
      if (error) throw error
      const chMap = new Map(
        ((chData ?? []) as { id: string; card_headline: string | null }[])
          .map(row => [row.id, row.card_headline])
      )
      for (const card of cards ?? []) {
        const cardHeadline = chMap.get(card.id)
        if (cardHeadline) card.card_headline = cardHeadline
      }
    } catch (error) {
      recordLabError(errors, 'card_headline', error)
    }
  }

  const groupsMap = new Map<string, InsightCard[]>()
  for (const card of cards ?? []) {
    const key = `${card.period_start}|${card.period_end}`
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key)!.push(card)
  }

  const insightGroups: InsightGroup[] = [...groupsMap.entries()].map(([key, groupCards]) => {
    const [start, end] = key.split('|')
    return { key, start, end, cards: groupCards }
  })

  const contentMapRecord: Record<string, ContentMetaRecord> = {}
  for (const [id, meta] of contentMap.entries()) {
    contentMapRecord[id] = meta
  }

  // ─── 키워드 트렌드 한 줄 (상승 4 + 하락 2) ───────────────────────────────
  const risingKws  = classifiedKeywords.filter(k => k.direction === '▲').slice(0, 4)
  const fallingKws = classifiedKeywords.filter(k => k.direction === '▽').slice(0, 2)
  const kwStrip    = [...risingKws, ...fallingKws]

  return {
    insightGroups,
    contentMap: contentMapRecord,
    bucketByTopic,
    trendingTopics,
    kwStrip,
    issueCards: issueCards ?? [],
    ...(errors.length > 0 ? { error: errors.join(' / ') } : {}),
  }
  } catch (error) {
    console.error('[lab] getLabData 실패:', error)
    return createEmptyLabData(getErrorMessage(error))
  }
}
