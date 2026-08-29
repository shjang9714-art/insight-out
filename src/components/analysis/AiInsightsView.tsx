import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ENTITY_TYPE_LABEL, type EntityType, type InsightCard, type InsightCardCitation, type WatchlistItem } from '@/lib/types'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import { tagTypeToBucket, type KeywordItem } from '@/lib/tag-buckets'
import { fetchIssueActivity } from '@/lib/issues/activity'
import type { InsightGroup, ContentMetaRecord } from '@/components/analysis/InsightCardsSectionClient'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { buildWeekSummary } from '@/lib/daily-insights/weeks'
import AiInsightBoard, { type TopicTrend, type SignalItem } from '@/components/analysis/AiInsightBoard'
import { getKeywordDailyCounts } from '@/lib/keywords/detail'
import { rankKeywords } from '@/lib/keywords/ranking'
import { isAdminRole } from '@/lib/admin/capabilities'

const WATCHLIST_LIMIT = 20
// 실측 후보 153개에 안전 여유를 둔 상한이며, 300개 노출을 목표로 하지 않는다.
const KEYWORD_CANDIDATE_CAP = 300

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentMeta {
  title: string
  category: string | null
  sourceName: string | null
  matchedKeywords: string[] | null
}

interface TrendingTopicRow {
  group_name: string
  cur: number
  prev: number
  change_pct: number | null
}

// ─── 뷰 ───────────────────────────────────────────────────────────────────────

interface AiInsightsViewProps {
  view?: 'brief' | 'headline' | 'trending' | 'issues' | 'graph' | 'keyword'
  /** "핵심 인사이트" 주차 선택기(§2) — week_of(월요일, KST) 문자열. 없으면 최신 주차. */
  week?: string
}

export default async function AiInsightsView({ view = 'brief', week }: AiInsightsViewProps) {
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

  // "핵심 인사이트" 목록(§2, 지시서 20260715 주간 복귀) — week_of(월요일) 단위로 그룹핑.
  // 주차 선택기가 고를 수 있는 week 목록을 먼저 조회한 뒤, 선택된 주(기본값 최신)만 필터한다.
  const { data: weekRows } = await supabase
    .from('daily_insights')
    .select('week_of')
    .eq('status', 'published')
    .not('week_of', 'is', null)
    .order('week_of', { ascending: false })

  const dailyInsightWeeks = [...new Set((weekRows ?? []).map((r) => r.week_of as string))]
  const latestWeek = dailyInsightWeeks[0] ?? null
  const selectedWeek = week && dailyInsightWeeks.includes(week) ? week : latestWeek
  const isLatestWeek = selectedWeek !== null && selectedWeek === latestWeek

  const dailyInsightQuery = supabase
    .from('daily_insights')
    .select('*')
    .eq('status', 'published')
    .eq('week_of', selectedWeek ?? '__none__')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  // 브리핑·이슈 모두 1회 패칭 (탭 전환 재패칭 0)
  const [insightRes, trendRes, keywordBucketsRes, watchlistRes, keywordGroupsRes, issueCards, entityRes, allEntityRes, signalSummaryRes, dailyInsightRes, profileRes, lguAliasRes] = await Promise.all([
    supabase
      .from('insight_cards')
      .select('id, period_start, period_end, topic, headline, implication, source_content_ids, citations, generated_at')
      .eq('status', 'published')
      .eq('scope', 'industry')
      .order('period_start', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(30),
    supabase.rpc('trending_topic_groups', { p_days: 14, p_top: 8 }),
    supabase.rpc('keyword_week_buckets', { p_days: 14, p_top: KEYWORD_CANDIDATE_CAP }),
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
    supabase
      .from('entities')
      .select('id, canonical_name, entity_type, is_competitor, mention_count')
      .order('mention_count', { ascending: false })
      .limit(500),
    supabase
      .from('entities')
      .select('id, canonical_name, entity_type, is_competitor, mention_count, description')
      .order('mention_count', { ascending: false })
      .limit(500),
    supabase
      .from('entity_signal_summary')
      .select('entity_id, signal_count, content_count, signal_types, last_seen')
      .order('signal_count', { ascending: false })
      .limit(30),
    dailyInsightQuery,
    // 관리자 여부 — 숨긴 하위탭('실험실') 노출 판정용
    user
      ? supabase.from('users').select('role').eq('id', user.id).single()
      : Promise.resolve({ data: null as { role: string } | null }),
    supabase
      .from('entity_aliases')
      .select('entity_id, alias')
      .in('alias', ['LG유플러스', 'LGU+', 'LG U+']),
  ])

  const isAdmin = isAdminRole(profileRes.data?.role)

  const cards = (insightRes.data ?? []) as InsightCard[]
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[]

  // ─── 관계지도 데이터 ────────────────────────────────────────────────────────
  type AllEntityRow = {
    id: string
    canonical_name: string
    entity_type: EntityType
    is_competitor: boolean
    mention_count: number
    description: string | null
  }
  const entities = (entityRes.data ?? []) as EntitySummary[]
  const allEntities = (allEntityRes.data ?? []) as AllEntityRow[]
  const lguNames = new Set(['LG유플러스', 'LGU+', 'LG U+'])
  const lguAliasEntityIds = new Set((lguAliasRes.data ?? []).map((row) => row.entity_id))
  const initialCenter = entities.find((entity) => (
    lguNames.has(entity.canonical_name) || lguAliasEntityIds.has(entity.id)
  )) ?? entities[0] ?? null
  const totalByType: Record<string, number> = { 전체: allEntities.length }
  for (const type of Object.keys(ENTITY_TYPE_LABEL) as EntityType[]) {
    totalByType[type] = allEntities.filter((e) => e.entity_type === type).length
  }

  // ─── 키워드 분석(구 기업동향 브리핑, 224B) — entity_signal_summary + entities 조인 ──────
  type SignalRow = {
    entity_id: string
    signal_count: number
    content_count: number
    signal_types: string[] | null
    last_seen: string | null
  }
  const signalRows = (signalSummaryRes.data ?? []) as SignalRow[]
  const signalItems: SignalItem[] = []
  if (signalRows.length > 0) {
    const eids = signalRows.map(r => r.entity_id)
    const { data: signalEntData } = await supabase
      .from('entities')
      .select('id, canonical_name, entity_type, is_competitor')
      .in('id', eids)

    type SignalEntityMeta = { id: string; canonical_name: string; entity_type: EntityType; is_competitor: boolean }
    const signalEntityMap = new Map<string, SignalEntityMeta>(
      ((signalEntData ?? []) as SignalEntityMeta[]).map(e => [e.id, e])
    )

    for (const row of signalRows) {
      const meta = signalEntityMap.get(row.entity_id)
      if (!meta) continue
      signalItems.push({
        entityId: row.entity_id,
        name: meta.canonical_name,
        entityType: meta.entity_type,
        isCompetitor: meta.is_competitor,
        signalCount: row.signal_count,
        contentCount: row.content_count,
        signalTypes: row.signal_types ?? [],
        lastSeen: row.last_seen,
      })
    }
  }

  if (trendRes.error) console.warn(`[AI인사이트] 뜨는 토픽 RPC 조회 실패: ${trendRes.error.message}`)
  const trendingTopics: TopicTrend[] = trendRes.error
    ? []
    : ((trendRes.data ?? []) as TrendingTopicRow[]).map((row) => ({
        group: row.group_name,
        cur: row.cur,
        prev: row.prev,
        changePct: row.change_pct,
      }))

  // ─── 키워드 방향 계산 ─────────────────────────────────────────────────────
  type KeywordBucketRow = { name: string; total: number; cur: number; prev: number }
  const keywordAggregationError = keywordBucketsRes.error
    ? '키워드 집계를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null
  if (keywordBucketsRes.error) {
    console.error('[키워드 분석] 주간 집계 RPC 실패:', keywordBucketsRes.error.message)
  }

  const kwFreq: Record<string, number> = {}
  const kwCurFreq: Record<string, number> = {}
  const kwPrevFreq: Record<string, number> = {}
  const keywordBuckets = (keywordBucketsRes.data ?? []) as KeywordBucketRow[]
  for (const row of keywordBuckets) {
    kwFreq[row.name] = Number(row.total)
    kwCurFreq[row.name] = Number(row.cur)
    kwPrevFreq[row.name] = Number(row.prev)
  }

  const topKeywords = keywordBuckets.map(row => ({
    name: row.name,
    count: Number(row.total),
  }))

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
    const changePct = prev === 0
      ? (cur > 0 ? 100 : 0)
      : Math.round(((cur - prev) / prev) * 100)
    const isNew = prev === 0 && cur > 0
    const direction: '▲' | '▽' | null = cur > prev ? '▲' : cur < prev ? '▽' : null
    return {
      name,
      count,
      size: 14,
      bucket,
      watched,
      isCompetitor: false,
      direction,
      changePct,
      cur,
      prev,
      isNew,
    }
  })

  // 351-D 비용 가드: 기본 급상승 랭킹에 실제 표시될 최대 10개만 7일 온디맨드 집계한다.
  const risingRankedKeywords = rankKeywords(classifiedKeywords, 'rising')
  const keywordDailySeries = view === 'keyword'
    ? Object.fromEntries(await Promise.all(
        risingRankedKeywords.map(async keyword => [
          keyword.name,
          await getKeywordDailyCounts(keyword.name, 7),
        ] as const)
      ))
    : {}

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
        .select('id, title, category, matched_keywords, sources(name)')
        .in('id', [...allIds])
      for (const row of contents ?? []) {
        const r = row as unknown as { id: string; title: string; category: string | null; matched_keywords: string[] | null; sources: { name: string } | null }
        contentMap.set(r.id, {
          title: r.title,
          category: r.category,
          sourceName: r.sources?.name ?? null,
          matchedKeywords: r.matched_keywords,
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

  // ─── "핵심 인사이트" 목록 — 선택된 주(week_of)의 daily_insights(§2, 지시서 20260715) ──
  const dailyInsights = (dailyInsightRes.data ?? []) as DailyInsightRow[]
  const weekSummary = selectedWeek ? buildWeekSummary(selectedWeek, dailyInsights, isLatestWeek) : null

  // ─── 클라이언트 보드에 데이터 props 위임 ─────────────────────────────────
  return (
    <AiInsightBoard
      initialView={view}
      isAdmin={isAdmin}
      dailyInsights={dailyInsights}
      dailyInsightWeeks={dailyInsightWeeks}
      selectedWeek={selectedWeek}
      isLatestWeek={isLatestWeek}
      weekTotal={weekSummary?.total ?? 0}
      weekNewCount={weekSummary?.newCount ?? 0}
      weekCategoryCoverage={weekSummary?.categoryCoverage ?? 0}
      insightGroups={isAdmin ? insightGroups : []}
      contentMap={contentMapRecord}
      trendingTopics={isAdmin ? trendingTopics : []}
      keywordAggregationError={keywordAggregationError}
      classifiedKeywords={classifiedKeywords}
      kwStrip={kwStrip}
      issueCards={isAdmin ? issueCards : []}
      bucketByTopic={bucketByTopic}
      entities={entities}
      allEntities={allEntities}
      initialCenter={initialCenter}
      totalByType={totalByType}
      signalItems={signalItems}
      keywordDailySeries={keywordDailySeries}
    />
  )
}
