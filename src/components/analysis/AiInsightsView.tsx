import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getKstTodayStartIso } from '@/lib/date'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import { tagTypeToBucket, type KeywordItem } from '@/lib/tag-buckets'
import { fetchIssueActivity } from '@/lib/issues/activity'
import type { InsightGroup, ContentMetaRecord } from '@/components/analysis/InsightCardsSectionClient'
import {
  buildRuleBrief,
  RISK_VOCAB,
  type BriefInput,
} from '@/lib/briefing/insight-brief'
import AiInsightBoard, { type TopicTrend } from '@/components/analysis/AiInsightBoard'

const WATCHLIST_LIMIT = 20

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentMeta {
  title: string
  category: string | null
  sourceName: string | null
}

// ─── 뜨는 토픽 집계 ──────────────────────────────────────────────────────────

function computeTrendingTopics(
  rows: { matched_groups: string[] | null; collected_at: string }[],
  todayStartMs: number,
  topN = 8,
): TopicTrend[] {
  const curMap: Record<string, number> = {}
  const prevMap: Record<string, number> = {}

  const thisWeekStart = todayStartMs - 6 * 24 * 60 * 60 * 1000
  const prevWeekStart = todayStartMs - 13 * 24 * 60 * 60 * 1000

  for (const row of rows) {
    if (!row.matched_groups?.length) continue
    const kstMs = new Date(row.collected_at).getTime() + 9 * 60 * 60 * 1000
    const isThisWeek = kstMs >= thisWeekStart + 9 * 60 * 60 * 1000
    const isPrevWeek = !isThisWeek && kstMs >= prevWeekStart + 9 * 60 * 60 * 1000
    for (const g of row.matched_groups) {
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

// ─── 뷰 ───────────────────────────────────────────────────────────────────────

export default async function AiInsightsView({ view = 'briefing' }: { view?: 'briefing' | 'issues' }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const todayStart   = getKstTodayStartIso()
  const todayStartMs = new Date(todayStart).getTime()
  const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

  // 브리핑·이슈 모두 1회 패칭 (탭 전환 재패칭 0)
  const [insightRes, trendRes, watchlistRes, keywordGroupsRes, issueCards] = await Promise.all([
    supabase
      .from('insight_cards')
      .select('id, period_start, period_end, topic, headline, implication, source_content_ids, citations, generated_at')
      .eq('status', 'published')
      .eq('scope', 'industry')
      .order('period_start', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(30),
    supabase
      .from('contents')
      .select('matched_groups, matched_keywords, collected_at')
      .eq('status', 'published')
      .gte('collected_at', fourteenDaysStart)
      .limit(1000),
    user
      ? supabase
          .from('user_watchlist')
          .select('id, user_id, company, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(WATCHLIST_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('keyword_groups')
      .select('name, tag_type, include_patterns')
      .eq('is_active', true)
      .limit(200),
    fetchIssueActivity(supabase),
  ])

  const cards = (insightRes.data ?? []) as InsightCard[]
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[]

  type TrendRow = { matched_groups: string[] | null; collected_at: string }
  const trendingTopics = computeTrendingTopics(
    (trendRes.data ?? []) as TrendRow[],
    todayStartMs,
  )

  // ─── 키워드 방향 계산 ─────────────────────────────────────────────────────
  type KwRow = { matched_keywords: string[] | null }
  const kwFreq: Record<string, number> = {}
  const kwCurFreq: Record<string, number> = {}
  const kwPrevFreq: Record<string, number> = {}
  const thisWeekStartMs = todayStartMs - 6 * 24 * 60 * 60 * 1000
  const prevWeekStartMs = todayStartMs - 13 * 24 * 60 * 60 * 1000

  for (const row of (trendRes.data ?? []) as (TrendRow & KwRow)[]) {
    if (!row.matched_keywords?.length) continue
    const kstMs = new Date(row.collected_at).getTime() + 9 * 60 * 60 * 1000
    const isThisWeek = kstMs >= thisWeekStartMs + 9 * 60 * 60 * 1000
    const isPrevWeek = !isThisWeek && kstMs >= prevWeekStartMs + 9 * 60 * 60 * 1000
    for (const kw of row.matched_keywords) {
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

  // ─── 관심업체 ─────────────────────────────────────────────────────────────
  const watchlistLower = watchlist.map(w => w.company.toLowerCase())
  const isWatched = (name: string): boolean => {
    const lower = name.toLowerCase()
    return watchlistLower.some(e => lower === e || lower.includes(e) || e.includes(lower))
  }

  // ─── 키워드 분류 ──────────────────────────────────────────────────────────
  type KgRow = { name: string; tag_type: string; include_patterns: string[] }
  const patternTagMap = new Map<string, string>()
  for (const g of (keywordGroupsRes.data ?? []) as KgRow[]) {
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
  const bucketByTopic: Record<string, import('@/lib/tag-buckets').TagBucket> = {}
  for (const card of cards) {
    const tagType = patternTagMap.get(card.topic.toLowerCase())
    bucketByTopic[card.topic] = tagTypeToBucket(tagType)
  }

  const classifiedKeywords: KeywordItem[] = topKeywords.map(({ name, count }) => {
    const watched = isWatched(name)
    const tagType = patternTagMap.get(name.toLowerCase())
    const bucket = tagTypeToBucket(tagType)
    const cur  = kwCurFreq[name]  ?? 0
    const prev = kwPrevFreq[name] ?? 0
    const direction: '▲' | '▽' | null = cur > prev ? '▲' : cur < prev ? '▽' : null
    return { name, count, size: 14, bucket, watched, isCompetitor: false, direction }
  })

  // ─── 인사이트 카드 그룹 ────────────────────────────────────────────────────
  const contentMap = new Map<string, ContentMeta>()
  if (cards.length > 0) {
    const allIds = new Set<string>()
    for (const card of cards) {
      for (const id of card.source_content_ids) allIds.add(id)
      for (const c of (card.citations as InsightCardCitation[])) allIds.add(c.content_id)
    }
    if (allIds.size > 0) {
      const { data: contents } = await supabase
        .from('contents')
        .select('id, title, category, sources(name)')
        .in('id', [...allIds])
      for (const row of contents ?? []) {
        const r = row as unknown as { id: string; title: string; category: string | null; sources: { name: string } | null }
        contentMap.set(r.id, {
          title: r.title,
          category: r.category,
          sourceName: r.sources?.name ?? null,
        })
      }
    }
  }

  // card_headline 보강
  if (cards.length > 0) {
    const { data: chData, error: chErr } = await supabase
      .from('insight_cards')
      .select('id, card_headline')
      .in('id', cards.map(c => c.id))
    if (!chErr && chData) {
      const chMap = new Map(
        (chData as { id: string; card_headline: string | null }[]).map(r => [r.id, r.card_headline])
      )
      for (const c of cards) {
        const ch = chMap.get(c.id)
        if (ch) c.card_headline = ch
      }
    }
  }

  const groupsMap = new Map<string, InsightCard[]>()
  for (const card of cards) {
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

  // ─── 브리핑 규칙 기반 즉시 생성 (LLM 동기 경로 제거) ─────────────────────
  const risingKwNames = classifiedKeywords.filter(k => k.direction === '▲').map(k => k.name)
  const watchlistHits = watchlist
    .filter(w => risingKwNames.some(kw => {
      const kl = kw.toLowerCase(); const wl = w.company.toLowerCase()
      return kl === wl || kl.includes(wl) || wl.includes(kl)
    }))
    .map(w => {
      const matchedKw = risingKwNames.find(kw => {
        const kl = kw.toLowerCase(); const wl = w.company.toLowerCase()
        return kl === wl || kl.includes(wl) || wl.includes(kl)
      })
      return { company: w.company, count: kwCurFreq[matchedKw ?? ''] ?? 1 }
    })
  const riskKeywords = risingKwNames.filter(kw => RISK_VOCAB.some(r => kw.includes(r)))
  const briefInput: BriefInput = { trendingTopics, risingKeywords: risingKwNames, watchlistHits, riskKeywords }
  const brief = buildRuleBrief(briefInput)

  // ─── 클라이언트 보드에 데이터 props 위임 ─────────────────────────────────
  return (
    <AiInsightBoard
      initialView={view}
      brief={brief}
      insightGroups={insightGroups}
      contentMap={contentMapRecord}
      trendingTopics={trendingTopics}
      kwStrip={kwStrip}
      issueCards={issueCards}
      bucketByTopic={bucketByTopic}
    />
  )
}
