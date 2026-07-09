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
import { cn } from '@/lib/utils'
import WatchlistTabHeader from '@/components/watchlist/WatchlistTabHeader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업동향 | Insight Out',
  description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['watchlist', 'competitor', 'trend'] as const

const COMPETITOR_GROUP_ORDER = ['통신', '클라우드·플랫폼', '빅테크']
const COMPETITOR_FALLBACK_GROUP = '기타 경쟁사'
type ViewId = typeof VALID_VIEWS[number]

const WATCHLIST_LIMIT = 20

function formatCompArticleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
  })
}

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
  // 회사를 competitor_group(통신/클라우드·플랫폼/빅테크, 224)으로 그룹 박스 묶고,
  // sentiment(긍/부) 대신 lgu_impact(위기/기회/관망, 241, LG U+ 관점)로 칩 표시.
  type LguImpactValue = '위기' | '기회' | '관망'
  type CompArticle = {
    id: string; title: string; collected_at: string
    lgu_impact: LguImpactValue | null
    matched_keywords: string[]; sources: { name: string } | { name: string }[] | null
  }
  type CompImpactDist = { 위기: number; 기회: number; 관망: number }
  type CompResult = { name: string; articles: CompArticle[]; articleTotal: number; impactDist: CompImpactDist }
  type CompGroupBucket = { name: string; results: CompResult[]; articleTotal: number; impactDist: CompImpactDist }

  const emptyImpactDist = (): CompImpactDist => ({ 위기: 0, 기회: 0, 관망: 0 })

  const competitorGroups: CompGroupBucket[] = []
  let competitorCount = 0
  const overallImpactDist = emptyImpactDist()

  if (view === 'competitor') {
    const todayStartMs = new Date(getKstTodayStartIso()).getTime()
    const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

    type CompetitorRow = { canonical_name: string; competitor_group: string | null }
    const { data: competitorRows, error: competitorGroupErr } = await supabase
      .from('entities')
      .select('canonical_name, competitor_group')
      .eq('is_competitor', true)
      .limit(50)

    let compRows: CompetitorRow[]
    if (competitorGroupErr?.code === '42703') {
      // competitor_group 컬럼 미적용(224 SQL 미실행) — 그룹 없이 재조회, graceful
      const { data: fallbackRows } = await supabase
        .from('entities')
        .select('canonical_name')
        .eq('is_competitor', true)
        .limit(50)
      compRows = ((fallbackRows ?? []) as { canonical_name: string }[]).map(r => ({ ...r, competitor_group: null }))
    } else {
      compRows = (competitorRows ?? []) as CompetitorRow[]
    }

    competitorCount = compRows.length

    if (compRows.length > 0) {
      const competitorNames = compRows.map(r => r.canonical_name).filter(Boolean)

      const { data: compArticleData, error: articlesErr } = await supabase
        .from('contents')
        .select('id, title, collected_at, lgu_impact, matched_keywords, sources(name)')
        .eq('status', 'published')
        .gte('collected_at', fourteenDaysStart)
        .overlaps('matched_keywords', competitorNames)
        .order('collected_at', { ascending: false })
        .limit(80)

      let allCompArticles: CompArticle[]
      if (articlesErr?.code === '42703') {
        // lgu_impact 컬럼 미적용(241 SQL 미실행) — 칩 없이 재조회, graceful
        const { data: fallbackArticles } = await supabase
          .from('contents')
          .select('id, title, collected_at, matched_keywords, sources(name)')
          .eq('status', 'published')
          .gte('collected_at', fourteenDaysStart)
          .overlaps('matched_keywords', competitorNames)
          .order('collected_at', { ascending: false })
          .limit(80)
        allCompArticles = ((fallbackArticles ?? []) as unknown[]).map(r => ({ ...(r as object), lgu_impact: null }) as CompArticle)
      } else {
        allCompArticles = (compArticleData ?? []) as unknown as CompArticle[]
      }

      const byGroup = new Map<string, CompResult[]>()
      for (const comp of compRows) {
        const nameLower = comp.canonical_name.toLowerCase()
        const matched = allCompArticles.filter(a =>
          (a.matched_keywords ?? []).some(k => k.toLowerCase() === nameLower)
        )
        if (matched.length === 0) continue

        const impactDist = emptyImpactDist()
        for (const a of matched) {
          if (a.lgu_impact === '위기') impactDist['위기']++
          else if (a.lgu_impact === '기회') impactDist['기회']++
          else if (a.lgu_impact === '관망') impactDist['관망']++
        }

        const groupName = comp.competitor_group || COMPETITOR_FALLBACK_GROUP
        if (!byGroup.has(groupName)) byGroup.set(groupName, [])
        byGroup.get(groupName)!.push({
          name: comp.canonical_name,
          articles: matched.slice(0, 5),
          articleTotal: matched.length,
          impactDist,
        })
      }

      const orderedGroupNames = [
        ...COMPETITOR_GROUP_ORDER.filter(g => byGroup.has(g)),
        ...[...byGroup.keys()].filter(g => g !== COMPETITOR_FALLBACK_GROUP && !COMPETITOR_GROUP_ORDER.includes(g)),
        ...(byGroup.has(COMPETITOR_FALLBACK_GROUP) ? [COMPETITOR_FALLBACK_GROUP] : []),
      ]

      for (const groupName of orderedGroupNames) {
        const results = byGroup.get(groupName)!
        const groupDist = emptyImpactDist()
        let articleTotal = 0
        for (const r of results) {
          groupDist['위기'] += r.impactDist['위기']
          groupDist['기회'] += r.impactDist['기회']
          groupDist['관망'] += r.impactDist['관망']
          articleTotal += r.articleTotal
        }
        overallImpactDist['위기'] += groupDist['위기']
        overallImpactDist['기회'] += groupDist['기회']
        overallImpactDist['관망'] += groupDist['관망']
        competitorGroups.push({ name: groupName, results, articleTotal, impactDist: groupDist })
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
          {user && <WatchlistTabHeader />}
          {!user || watchlist.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">아직 관심 기업이 없습니다</p>
              <p className="text-xs text-muted-foreground">
                {user ? (
                  '위 "관심기업 설정" 버튼으로 회사를 검색해 추가하면 기업별 AI 인사이트가 여기 표시됩니다.'
                ) : (
                  <>
                    <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">마이페이지</Link>
                    에서 관심 기업을 설정하면 기업별 AI 인사이트가 여기 표시됩니다.
                  </>
                )}
              </p>
            </div>
          ) : companyInsightGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">관심 기업 인사이트가 아직 없습니다. (AI 생성·승인 후 표시)</p>
          ) : (
            <InsightCardsSectionClient groups={companyInsightGroups} contentMap={companyContentMap} bucketByTopic={bucketByTopic} />
          )}
        </div>
      )}

      {/* 경쟁사 최근 뉴스 탭 */}
      {view === 'competitor' && (
        <div>
          {competitorCount === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
            </div>
          ) : competitorGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              최근 14일 경쟁사 관련 기사가 없습니다.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <p className="text-xs text-muted-foreground">최근 14일 · 경쟁사 관련 뉴스</p>
                {(overallImpactDist['위기'] + overallImpactDist['기회'] + overallImpactDist['관망'] > 0) && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>LG U+ 관점:</span>
                    {overallImpactDist['위기'] > 0 && (
                      <span className="rounded-full px-2 py-0.5 bg-negative-soft text-negative font-semibold">위기 {overallImpactDist['위기']}</span>
                    )}
                    {overallImpactDist['기회'] > 0 && (
                      <span className="rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-semibold">기회 {overallImpactDist['기회']}</span>
                    )}
                    {overallImpactDist['관망'] > 0 && (
                      <span className="rounded-full px-2 py-0.5 bg-muted text-muted-foreground font-semibold">관망 {overallImpactDist['관망']}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {competitorGroups.map(group => (
                  <div key={group.name} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                      <h3 className="text-[15px] font-bold text-foreground">{group.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {group.results.length}개사 · {group.articleTotal}건
                      </span>
                      <div className="flex-1" />
                      {(group.impactDist['위기'] + group.impactDist['기회'] + group.impactDist['관망'] > 0) && (
                        <div className="flex items-center gap-1">
                          {group.impactDist['위기'] > 0 && (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-negative-soft text-negative">위기 {group.impactDist['위기']}</span>
                          )}
                          {group.impactDist['기회'] > 0 && (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">기회 {group.impactDist['기회']}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 overflow-x-auto p-4">
                      {group.results.map(({ name, articles, articleTotal, impactDist }) => (
                        <div
                          key={name}
                          className="flex-none w-[288px] rounded-lg border border-border bg-card p-3.5 hover:border-brand-200 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-bold text-foreground truncate">{name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {impactDist['위기'] > 0 && (
                                <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-negative-soft text-negative">위기 {impactDist['위기']}</span>
                              )}
                              {impactDist['기회'] > 0 && (
                                <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">기회 {impactDist['기회']}</span>
                              )}
                              {impactDist['관망'] > 0 && (
                                <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">관망 {impactDist['관망']}</span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {articles.slice(0, 2).map((a, i) => {
                              const sourceName = Array.isArray(a.sources) ? a.sources[0]?.name : a.sources?.name
                              return (
                                <Link
                                  key={a.id}
                                  href={`/dashboard/contents/${a.id}`}
                                  className={cn(
                                    'flex items-center gap-2 py-1.5 text-xs text-foreground/80 hover:text-brand-600',
                                    i > 0 && 'border-t border-dashed border-border'
                                  )}
                                >
                                  <span className="line-clamp-1 flex-1 min-w-0">
                                    {a.title}
                                    {sourceName && <span className="ml-1 text-muted-foreground/60">· {sourceName}</span>}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground shrink-0">
                                    {formatCompArticleDate(a.collected_at)}
                                  </span>
                                </Link>
                              )
                            })}
                          </div>
                          {articleTotal > 2 && (
                            <p className="mt-1 text-[11px] font-medium text-brand-600">기사 {articleTotal - 2}건 더 →</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
              boxed
            />
          )}
        </div>
      )}
    </PageContainer>
  )
}
