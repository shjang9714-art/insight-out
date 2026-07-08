import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'
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

const VALID_VIEWS = ['watchlist', 'competitor', 'briefing'] as const
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
            .select('id, title, category, matched_keywords, sources(name)')
            .in('id', [...allIds])
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

  // ─── 브리핑 탭 ───────────────────────────────────────────────────────────
  interface BriefingRow {
    entity_id: string
    signal_count: number
    content_count: number
    signal_types: string[] | null
    last_seen: string | null
  }
  interface BriefingEntityMeta {
    id: string
    canonical_name: string
    entity_type: EntityType
    is_competitor: boolean
  }

  const briefingRows: BriefingRow[] = []
  const briefingEntityMap = new Map<string, BriefingEntityMeta>()

  if (view === 'briefing') {
    const { data: summaryData } = await supabase
      .from('entity_signal_summary')
      .select('entity_id, signal_count, content_count, signal_types, last_seen')
      .order('signal_count', { ascending: false })
      .limit(30)

    if (summaryData && summaryData.length > 0) {
      briefingRows.push(...(summaryData as unknown as BriefingRow[]))

      const eids = briefingRows.map(r => r.entity_id)
      const { data: entData } = await supabase
        .from('entities')
        .select('id, canonical_name, entity_type, is_competitor')
        .in('id', eids)

      for (const e of (entData ?? []) as BriefingEntityMeta[]) {
        briefingEntityMap.set(e.id, e)
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

      {/* 브리핑 탭 */}
      {view === 'briefing' && (
        <div>
          {briefingRows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              시그널 데이터가 있는 엔티티가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {briefingRows.map(row => {
                const ent = briefingEntityMap.get(row.entity_id)
                if (!ent) return null
                const typeLabel = ENTITY_TYPE_LABEL[ent.entity_type]
                const displayDate = row.last_seen
                  ? new Date(row.last_seen).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
                    })
                  : null
                const topSignals = (row.signal_types ?? []).slice(0, 3)
                return (
                  <Link
                    key={row.entity_id}
                    href={`/dashboard/entities/${row.entity_id}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-600/40"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
                        {ent.canonical_name}
                      </span>
                      <span className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        ent.is_competitor && ent.entity_type === 'company'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-border bg-muted text-muted-foreground'
                      )}>
                        {typeLabel}
                      </span>
                    </div>

                    {topSignals.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {topSignals.map(sig => (
                          <span
                            key={sig}
                            className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>시그널 {row.signal_count.toLocaleString()}건</span>
                      <span>콘텐츠 {row.content_count.toLocaleString()}건</span>
                      {displayDate && <span className="ml-auto">{displayDate}</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
