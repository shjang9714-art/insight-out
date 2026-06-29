import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import { getKstTodayStartIso } from '@/lib/date'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import EntitiesPageClient from '@/components/entities/EntitiesPageClient'
import EntityTabs from '@/components/entities/EntityTabs'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업동향 | Insight Out',
  description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['watchlist', 'competitor', 'graph'] as const
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
  let watchlist: WatchlistItem[] = []

  if (view === 'watchlist') {
    const [watchlistRes, companyCardsRes] = await Promise.all([
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
    ])

    watchlist = (watchlistRes.data ?? []) as WatchlistItem[]
    const rawCompanyCards = (companyCardsRes.data ?? []) as InsightCard[]

    if (watchlist.length > 0) {
      const watchlistLower = watchlist.map(w => w.company.toLowerCase())
      const isWatched = (name: string) => {
        const lower = name.toLowerCase()
        return watchlistLower.some(e => lower === e || lower.includes(e) || e.includes(lower))
      }

      const companyCards = rawCompanyCards.filter(c => c.topic && isWatched(c.topic)).slice(0, 12)

      // card_headline 보강
      if (companyCards.length > 0) {
        const { data: chData, error: chErr } = await supabase
          .from('insight_cards')
          .select('id, card_headline')
          .in('id', companyCards.map(c => c.id))
        if (!chErr && chData) {
          const chMap = new Map(
            (chData as { id: string; card_headline: string | null }[]).map(r => [r.id, r.card_headline])
          )
          for (const c of companyCards) {
            const ch = chMap.get(c.id)
            if (ch) c.card_headline = ch
          }
        }
      }

      // contentMap
      if (companyCards.length > 0) {
        const allIds = new Set<string>()
        for (const card of companyCards) {
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
            companyContentMap[r.id] = {
              title: r.title,
              category: r.category,
              sourceName: r.sources?.name ?? null,
            }
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

  // ─── 관계지도 탭 ─────────────────────────────────────────────────────────
  let entities: EntitySummary[] = []
  let allEntities: {
    id: string
    canonical_name: string
    entity_type: EntityType
    is_competitor: boolean
    mention_count: number
    description: string | null
  }[] = []
  let initialCenter: EntitySummary | null = null
  let totalByType: Record<string, number> = {}

  if (view === 'graph') {
    const [entityRes, allEntityRes] = await Promise.all([
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
    ])

    entities = (entityRes.data ?? []) as EntitySummary[]
    allEntities = (allEntityRes.data ?? []) as typeof allEntities
    initialCenter = entities.length > 0 ? entities[0] : null
    totalByType = { 전체: allEntities.length }
    for (const type of Object.keys(ENTITY_TYPE_LABEL) as EntityType[]) {
      totalByType[type] = allEntities.filter((e) => e.entity_type === type).length
    }
  }

  return (
    <div className="px-4 py-6 sm:px-5">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">기업동향</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">관심기업·경쟁사 동향과 엔티티 관계를 탐색합니다.</p>
      </div>

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
            <InsightCardsSectionClient groups={companyInsightGroups} contentMap={companyContentMap} />
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

      {/* 관계지도 탭 */}
      {view === 'graph' && (
        <EntitiesPageClient
          initialCenter={initialCenter}
          entities={entities}
          allEntities={allEntities}
          totalByType={totalByType}
        />
      )}
    </div>
  )
}
