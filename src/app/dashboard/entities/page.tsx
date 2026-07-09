import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import EntityTabs from '@/components/entities/EntityTabs'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import { tagTypeToBucket, type TagBucket } from '@/lib/tag-buckets'
import PageContainer from '@/components/PageContainer'
import WatchlistTabHeader from '@/components/watchlist/WatchlistTabHeader'
import { getCompetitorNewsData } from '@/lib/entities/competitor-news'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import { getMajorCompaniesData } from '@/lib/entities/major-companies'
import MajorCompanyGroups from '@/components/entities/MajorCompanyGroups'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업동향 | Insight Out',
  description: '관심기업·경쟁사 동향 및 엔티티 관계 탐색 — 기업·기술·이슈를 한눈에 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['watchlist', 'competitor', 'trend'] as const

const COMPETITOR_GROUP_ORDER = ['통신', '클라우드·플랫폼', '빅테크']
type ViewId = typeof VALID_VIEWS[number]

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

  // ─── 주요 기업 탭 ─────────────────────────────────────────────────────────
  // 255: curated_groups/curated_companies(253) 기반 계층(7그룹 → 대표 3~5 → 전체보기).
  const majorCompanies = view === 'watchlist'
    ? await getMajorCompaniesData(supabase, { userId: user?.id })
    : { groups: [], curatedApplied: true }
  const { groups: majorGroups, curatedApplied } = majorCompanies
  const MAJOR_REP_COUNT = 5

  // ─── 경쟁사 최근 뉴스 탭 ─────────────────────────────────────────────────
  // 데이터 조립은 lib/entities/competitor-news.ts 공유 헬퍼(245) — 전체 페이지와 동일 로직.
  const competitorNews = view === 'competitor'
    ? await getCompetitorNewsData(supabase)
    : { competitorCount: 0, groups: [], overallImpactDist: { 위기: 0, 기회: 0, 관망: 0 } }
  const { competitorCount, groups: competitorGroups, overallImpactDist } = competitorNews
  const COMPETITOR_SUMMARY_CAP = 6

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

      {/* 주요 기업 탭 */}
      {view === 'watchlist' && (
        <div>
          {user && <WatchlistTabHeader />}
          {!curatedApplied ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">주요 기업 데이터 준비 중입니다</p>
              <p className="text-xs text-muted-foreground">큐레이션 그룹·기업 목록이 곧 반영됩니다.</p>
            </div>
          ) : majorGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">주요 기업 동향이 아직 없습니다</p>
              <p className="text-xs text-muted-foreground">AI 생성·승인 후 이곳에 표시됩니다.</p>
            </div>
          ) : (
            <MajorCompanyGroups
              groups={majorGroups}
              repCount={MAJOR_REP_COUNT}
              seeAllHrefBase="/dashboard/entities/major"
            />
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
                <div className="flex items-center gap-3">
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
                  <Link href="/dashboard/entities/competitor-news" className="text-xs font-medium text-brand-600 hover:underline">
                    전체보기 →
                  </Link>
                </div>
              </div>

              <CompetitorNewsGroups
                groups={competitorGroups}
                capPerGroup={COMPETITOR_SUMMARY_CAP}
                seeAllHref="/dashboard/entities/competitor-news"
              />
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
