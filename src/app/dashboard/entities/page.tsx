import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getKstTodayStartIso } from '@/lib/date'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import EntityTabs from '@/components/entities/EntityTabs'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import { tagTypeToBucket, type TagBucket } from '@/lib/tag-buckets'
import PageContainer from '@/components/PageContainer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업동향 | Insight Out',
  description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['watchlist', 'competitor', 'trend'] as const

const COMPETITOR_GROUP_ORDER = ['통신', '클라우드·플랫폼', '빅테크']
type ViewId = typeof VALID_VIEWS[number]

const WATCHLIST_LIMIT = 20

export default async function EntitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: ViewId = (VALID_VIEWS.includes(raw as ViewId) ? raw : 'watchlist') as ViewId

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ─── 관심기업 탭 ─────────────────────────────────────────────────────────
  const companyInsightGroups: InsightGroup[] = []
  const companyContentMap: Record<string, ContentMetaRecord> = {}
  const bucketByTopic: Record<string, TagBucket> = {}
  let watchlist: WatchlistItem[] = []

  if (view === 'watchlist') {
    const [watchlistRes, companyCardsRes, keywordGroupsRes] = await Promise.all([
      user
        ? supabase
            .from('user_watchlist')
            .select('id, user_id, company, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(WATCHLIST_LIMIT)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('insight_cards')
        .select('id, period_start, period_end, scope, topic, headline, implication, source_content_ids, citations, generated_at, status')
        .eq('status', 'published')
        .eq('scope', 'company')
        .order('period_start', { ascending: false })
        .order('generated_at', { ascending: false })
        .limit(60),
      supabase
        .from('keyword_groups')
        .select('name, tag_type, include_patterns')
        .eq('is_active', true)
        .limit(200),
    ])

    watchlist = (watchlistRes.data ?? []) as WatchlistItem[]
    const rawCompanyCards = (companyCardsRes.data ?? []) as InsightCard[]

    // ─── 토픽→버킷 매핑 (167 규칙 재사용) ────────────────────────────────────
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

    if (watchlist.length > 0) {
      const watchlistLower = watchlist.map(w => w.company.toLowerCase())
      const isWatched = (name: string) => {
        const lower = name.toLowerCase()
        return watchlistLower.some(e => lower === e || lower.includes(e) || e.includes(lower))
      }

      const companyCards = rawCompanyCards.filter(c => c.topic && isWatched(c.topic)).slice(0, 12)

      for (const card of companyCards) {
        const tagType = patternTagMap.get(card.topic.toLowerCase())
        bucketByTopic[card.topic] = tagTypeToBucket(tagType)
      }

      // card_headline 보강 + contentMap — 둘 다 companyCards 기반, 서로 독립 → 병렬화(231)
      if (companyCards.length > 0) {
        const allIds = new Set<string>()
        for (const card of companyCards) {
          for (const id of card.source_content_ids) allIds.add(id)
          for (const c of (card.citations as InsightCardCitation[])) allIds.add(c.content_id)
        }

        const [{ data: chData, error: chErr }, { data: contents }] = await Promise.all([
          supabase
            .from('insight_cards')
            .select('id, card_headline')
            .in('id', companyCards.map(c => c.id)),
          allIds.size > 0
            ? supabase
                .from('contents')
                .select('id, title, category, matched_keywords, sources(name)')
                .in('id', [...allIds])
            : Promise.resolve({ data: [] as unknown[] }),
        ])

        if (!chErr && chData) {
          const chMap = new Map(
            (chData as { id: string; card_headline: string | null }[]).map(r => [r.id, r.card_headline])
          )
          for (const c of companyCards) {
            const ch = chMap.get(c.id)
            if (ch) c.card_headline = ch
          }
        }

        for (const row of contents ?? []) {
          const r = row as unknown as { id: string; title: string; category: string | null; matched_keywords: string[] | null; sources: { name: string } | null }
          companyContentMap[r.id] = {
            title: r.title,
            category: r.category,
            sourceName: r.sources?.name ?? null,
            matchedKeywords: r.matched_keywords,
          }
        }
      }

      const groupsMap = new Map<string, InsightCard[]>()
      for (const card of companyCards) {
        const key = `${card.period_start}|${card.period_end}`
        if (!groupsMap.has(key)) groupsMap.set(key, [])
        groupsMap.get(key)!.push(card)
      }
      for (const [key, gc] of groupsMap.entries()) {
        const [start, end] = key.split('|')
        companyInsightGroups.push({ key, start, end, cards: gc })
      }
    }
  }

  // ─── 경쟁사 탭 ───────────────────────────────────────────────────────────
  type CompArticle = { id: string; title: string; collected_at: string; sentiment: '긍정' | '중립' | '부정' | null; matched_keywords: string[]; sources: { name: string } | null }
  type CompResult = { name: string; articles: CompArticle[]; dist: { 긍정: number; 중립: number; 부정: number } }

  const competitorResults: CompResult[] = []
  let competitorCount = 0

  if (view === 'competitor') {
    const todayStartMs = new Date(getKstTodayStartIso()).getTime()
    const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

    const { data: competitorRows } = await supabase
      .from('entities')
      .select('canonical_name')
      .eq('is_competitor', true)
      .limit(50)

    const competitorNames = (competitorRows ?? []).map((k: { canonical_name: string }) => k.canonical_name).filter(Boolean)
    competitorCount = competitorNames.length

    if (competitorNames.length > 0) {
      const { data: compArticleData } = await supabase
        .from('contents')
        .select('id, title, collected_at, sentiment, matched_keywords, sources(name)')
        .eq('status', 'published')
        .gte('collected_at', fourteenDaysStart)
        .overlaps('matched_keywords', competitorNames)
        .order('collected_at', { ascending: false })
        .limit(80)

      const allCompArticles = (compArticleData ?? []) as unknown as CompArticle[]

      for (const compName of competitorNames) {
        const nameLower = compName.toLowerCase()
        const matched = allCompArticles.filter(a =>
          (a.matched_keywords ?? []).some(k => k.toLowerCase() === nameLower)
        )
        if (matched.length === 0) continue

        const dist = { 긍정: 0, 중립: 0, 부정: 0 }
        for (const a of matched) {
          if (a.sentiment === '긍정')      dist['긍정']++
          else if (a.sentiment === '중립') dist['중립']++
          else if (a.sentiment === '부정') dist['부정']++
        }

        competitorResults.push({ name: compName, articles: matched.slice(0, 5), dist })
      }
    }
  }

  // ─── 경쟁사(동향) 탭 ─────────────────────────────────────────────────────────
  // 헤드라인분석(insight_cards) 카드를 competitor_group(통신/클라우드·플랫폼/빅테크)으로
  // 재그룹핑해 재사용(224). 새 AI 생성 없음 — 기존 카드 재배치만.
  const trendGroups: InsightGroup[] = []
  const trendContentMap: Record<string, ContentMetaRecord> = {}
  const trendBucketByTopic: Record<string, TagBucket> = {}
  let hasAnyCompetitorGroup = false

  if (view === 'trend') {
    type EntityGroupRow = { id: string; canonical_name: string; competitor_group: string | null }
    type AliasRow = { entity_id: string; alias: string }
    type KgRow = { name: string; tag_type: string; include_patterns: string[] }

    const [cardsRes, entitiesRes, aliasesRes, keywordGroupsRes] = await Promise.all([
      supabase
        .from('insight_cards')
        .select('id, period_start, period_end, scope, topic, headline, implication, source_content_ids, citations, generated_at, status')
        .eq('status', 'published')
        .in('scope', ['industry', 'company'])
        .order('period_start', { ascending: false })
        .order('generated_at', { ascending: false })
        .limit(80),
      supabase
        .from('entities')
        .select('id, canonical_name, competitor_group')
        .not('competitor_group', 'is', null),
      supabase
        .from('entity_aliases')
        .select('entity_id, alias'),
      supabase
        .from('keyword_groups')
        .select('name, tag_type, include_patterns')
        .eq('is_active', true)
        .limit(200),
    ])

    // competitor_group 컬럼 미적용(224 SQL 미실행, 42703) — graceful. 그룹 없음으로 처리.
    if (entitiesRes.error?.code !== '42703') {
      const groupByEntityId = new Map<string, string>()
      const entityRows = (entitiesRes.data ?? []) as EntityGroupRow[]
      for (const e of entityRows) {
        if (e.competitor_group) groupByEntityId.set(e.id, e.competitor_group)
      }

      // 이름/별칭(lower) → competitor_group 맵
      const nameToGroup = new Map<string, string>()
      for (const e of entityRows) {
        const grp = groupByEntityId.get(e.id)
        if (grp) nameToGroup.set(e.canonical_name.toLowerCase(), grp)
      }
      for (const a of (aliasesRes.data ?? []) as AliasRow[]) {
        const grp = groupByEntityId.get(a.entity_id)
        if (grp) nameToGroup.set(a.alias.toLowerCase(), grp)
      }
      hasAnyCompetitorGroup = nameToGroup.size > 0

      // 카드 topic → 그룹 매칭: 정확일치 우선, 부분포함은 길이 3+ 별칭만(짧은 별칭 오탐 방지, 224 §3)
      function matchGroup(topic: string): string | null {
        const t = topic.toLowerCase()
        const exact = nameToGroup.get(t)
        if (exact) return exact
        for (const [name, grp] of nameToGroup) {
          if (name.length >= 3 && (t.includes(name) || name.includes(t))) return grp
        }
        return null
      }

      const rawCards = ((cardsRes.data ?? []) as InsightCard[]).filter(c => c.topic)
      const byGroup = new Map<string, InsightCard[]>()
      for (const card of rawCards) {
        const grp = matchGroup(card.topic)
        if (!grp) continue
        if (!byGroup.has(grp)) byGroup.set(grp, [])
        byGroup.get(grp)!.push(card)
      }

      const orderedGroupNames = [
        ...COMPETITOR_GROUP_ORDER.filter(g => byGroup.has(g)),
        ...[...byGroup.keys()].filter(g => !COMPETITOR_GROUP_ORDER.includes(g)),
      ]
      for (const groupName of orderedGroupNames) {
        trendGroups.push({ key: groupName, start: '', end: '', label: groupName, cards: byGroup.get(groupName)! })
      }

      // 토픽→버킷 매핑 (167 규칙, watchlist와 동일 방식)
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
      for (const card of rawCards) {
        if (byGroup.has(matchGroup(card.topic) ?? '')) {
          const tagType = patternTagMap.get(card.topic.toLowerCase())
          trendBucketByTopic[card.topic] = tagTypeToBucket(tagType)
        }
      }

      // card_headline 보강 + contentMap (watchlist와 동일 방식, 224 §2-2-5)
      if (trendGroups.length > 0) {
        const allCards = trendGroups.flatMap(g => g.cards)
        const allIds = new Set<string>()
        for (const card of allCards) {
          for (const id of card.source_content_ids) allIds.add(id)
          for (const c of (card.citations as InsightCardCitation[])) allIds.add(c.content_id)
        }

        const [{ data: chData, error: chErr }, { data: contents }] = await Promise.all([
          supabase
            .from('insight_cards')
            .select('id, card_headline')
            .in('id', allCards.map(c => c.id)),
          allIds.size > 0
            ? supabase
                .from('contents')
                .select('id, title, category, matched_keywords, sources(name)')
                .in('id', [...allIds])
            : Promise.resolve({ data: [] as unknown[] }),
        ])

        if (!chErr && chData) {
          const chMap = new Map(
            (chData as { id: string; card_headline: string | null }[]).map(r => [r.id, r.card_headline])
          )
          for (const card of allCards) {
            const ch = chMap.get(card.id)
            if (ch) card.card_headline = ch
          }
        }

        for (const row of contents ?? []) {
          const r = row as unknown as { id: string; title: string; category: string | null; matched_keywords: string[] | null; sources: { name: string } | null }
          trendContentMap[r.id] = {
            title: r.title,
            category: r.category,
            sourceName: r.sources?.name ?? null,
            matchedKeywords: r.matched_keywords,
          }
        }
      }
    }
  }

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <EntityTabs />
      </Suspense>

      {/* 관심기업 탭 */}
      {view === 'watchlist' && (
        <div>
          {!user || watchlist.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">아직 관심 기업이 없습니다</p>
              <p className="text-xs text-muted-foreground">
                <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">마이페이지</Link>
                에서 관심 기업을 설정하면 기업별 AI 인사이트가 여기 표시됩니다.
              </p>
            </div>
          ) : companyInsightGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">관심 기업 인사이트가 아직 없습니다. (AI 생성·승인 후 표시)</p>
          ) : (
            <InsightCardsSectionClient groups={companyInsightGroups} contentMap={companyContentMap} bucketByTopic={bucketByTopic} />
          )}
        </div>
      )}

      {/* 경쟁사 탭 */}
      {view === 'competitor' && (
        <div>
          {competitorCount === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
            </div>
          ) : competitorResults.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              최근 14일 경쟁사 관련 기사가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {competitorResults.map(({ name, articles, dist }) => {
                const hasDistData = dist['긍정'] + dist['중립'] + dist['부정'] > 0
                const topArticle = articles[0]
                const topSourceName = topArticle
                  ? (Array.isArray(topArticle.sources)
                    ? (topArticle.sources as { name: string }[])[0]?.name
                    : topArticle.sources?.name)
                  : null
                return (
                  <div key={name} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-foreground">{name}</span>
                      {hasDistData && (
                        <div className="flex items-center gap-1 text-[11px]">
                          {dist['긍정'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-positive-soft text-positive font-medium">
                              긍 {dist['긍정']}
                            </span>
                          )}
                          {dist['중립'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-medium">
                              중 {dist['중립']}
                            </span>
                          )}
                          {dist['부정'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-negative-soft text-negative font-medium">
                              부 {dist['부정']}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {topArticle && (
                      <Link
                        href={`/dashboard/contents/${topArticle.id}`}
                        className="text-xs text-foreground/80 hover:text-brand-600 line-clamp-1"
                      >
                        {topArticle.title}
                        {topSourceName && (
                          <span className="ml-1 text-muted-foreground/60">· {topSourceName}</span>
                        )}
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 경쟁사(동향) 탭 */}
      {view === 'trend' && (
        <div>
          {trendGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">
                {!hasAnyCompetitorGroup ? '아직 등록된 경쟁사 그룹이 없습니다' : '경쟁사 동향 인사이트가 아직 없습니다'}
              </p>
              <p className="text-xs text-muted-foreground">
                {!hasAnyCompetitorGroup
                  ? '어드민 > 엔티티 관리에서 경쟁사 그룹(통신·클라우드/플랫폼·빅테크)을 지정하면 여기에 모아 보여드립니다.'
                  : '등록된 경쟁사 관련 AI 인사이트가 생성되면 이곳에 표시됩니다.'}
              </p>
            </div>
          ) : (
            <InsightCardsSectionClient
              groups={trendGroups}
              contentMap={trendContentMap}
              bucketByTopic={trendBucketByTopic}
            />
          )}
        </div>
      )}
    </PageContainer>
  )
}
