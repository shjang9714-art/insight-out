import type React from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp, Building2, Network, FileText } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import type { EntityType } from '@/lib/types'
import { tagTypeToBucket } from '@/lib/tag-buckets'
import { fetchIssueActivity } from '@/lib/issues/activity'
import type { KeywordItem } from '@/components/dashboard/KeywordMap'
import LensSwitcher from '@/components/lens/LensSwitcher'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import NewsCardSlider, { type NewsSlide } from '@/components/analysis/NewsCardSlider'

const WATCHLIST_LIMIT = 20

function formatSlideDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentMeta {
  title: string
  category: string | null
  sourceName: string | null
}

// ─── 뜨는 토픽 집계 ──────────────────────────────────────────────────────────

interface TopicTrend {
  group: string
  cur: number
  prev: number
  changePct: number | null
}

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

function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-0.5">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  )
}


// ─── 뷰 ───────────────────────────────────────────────────────────────────────

export default async function AiInsightsView() {
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

  const [insightRes, trendRes, watchlistRes, competitorNamesRes, keywordGroupsRes, entityTeaserRes, newsSlideRes, companyCardsRes] = await Promise.all([
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
      .from('entities')
      .select('canonical_name')
      .eq('is_competitor', true)
      .limit(50),
    supabase
      .from('keyword_groups')
      .select('name, tag_type, include_patterns')
      .eq('is_active', true)
      .limit(200),
    supabase
      .from('entities')
      .select('id, canonical_name, entity_type, mention_count')
      .order('mention_count', { ascending: false })
      .limit(10),
    supabase
      .from('contents')
      .select('id, title, summary_ko, collected_at, sources(name)')
      .eq('status', 'published')
      .not('summary_ko', 'is', null)
      .order('collected_at', { ascending: false })
      .limit(5),
    supabase
      .from('insight_cards')
      .select('id, period_start, period_end, scope, topic, headline, implication, source_content_ids, citations, generated_at, status')
      .eq('status', 'published')
      .eq('scope', 'company')
      .order('period_start', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(60),
  ])

  const cards = (insightRes.data ?? []) as InsightCard[]
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[]
  const competitorNames = (competitorNamesRes.data ?? []).map((k: { canonical_name: string }) => k.canonical_name).filter(Boolean)

  type TrendRow = { matched_groups: string[] | null; collected_at: string }
  const trendingTopics = computeTrendingTopics(
    (trendRes.data ?? []) as TrendRow[],
    todayStartMs,
  )

  // ─── 키워드 방향 계산 (이번 주 vs 직전 주) ───────────────────────────────
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

  const rawCompanyCards = (companyCardsRes.data ?? []) as InsightCard[]
  const companyCards = watchlist.length > 0
    ? rawCompanyCards.filter(c => c.topic && isWatched(c.topic)).slice(0, 12)
    : []

  // ─── 경쟁사 ────────────────────────────────────────────────────────────────
  type CompArticle = { id: string; title: string; collected_at: string; sentiment: '긍정' | '중립' | '부정' | null; matched_keywords: string[]; sources: { name: string } | null }
  type CompResult = { name: string; articles: CompArticle[]; dist: { 긍정: number; 중립: number; 부정: number } }

  const competitorResults: CompResult[] = []
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

  // ─── 키워드 분류 (경쟁사 Set = entities.is_competitor 기준, 별도 쿼리 불필요) ─
  const competitorSet = new Set<string>(competitorNames)

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

  const classifiedKeywords: KeywordItem[] = topKeywords.map(({ name, count }) => {
    const watched = isWatched(name)
    const isCompetitor = !watched && competitorSet.has(name)
    const tagType = patternTagMap.get(name.toLowerCase())
    const bucket = tagTypeToBucket(tagType)
    const cur  = kwCurFreq[name]  ?? 0
    const prev = kwPrevFreq[name] ?? 0
    const direction: '▲' | '▽' | null = cur > prev ? '▲' : cur < prev ? '▽' : null
    return { name, count, size: 14, bucket, watched, isCompetitor, direction }
  })

  // ─── 인사이트 카드 그룹 ────────────────────────────────────────────────────
  const contentMap = new Map<string, ContentMeta>()
  if (cards.length > 0 || companyCards.length > 0) {
    const allIds = new Set<string>()
    for (const card of [...cards, ...companyCards]) {
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

  const groupsMap = new Map<string, InsightCard[]>()
  for (const card of cards) {
    const key = `${card.period_start}|${card.period_end}`
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key)!.push(card)
  }

  // 직렬화 가능 형태로 변환 (InsightCardsSectionClient props)
  const insightGroups: InsightGroup[] = [...groupsMap.entries()].map(([key, groupCards]) => {
    const [start, end] = key.split('|')
    return { key, start, end, cards: groupCards }
  })

  const contentMapRecord: Record<string, ContentMetaRecord> = {}
  for (const [id, meta] of contentMap.entries()) {
    contentMapRecord[id] = meta
  }

  const companyGroupsMap = new Map<string, InsightCard[]>()
  for (const card of companyCards) {
    const key = `${card.period_start}|${card.period_end}`
    if (!companyGroupsMap.has(key)) companyGroupsMap.set(key, [])
    companyGroupsMap.get(key)!.push(card)
  }
  const companyInsightGroups: InsightGroup[] = [...companyGroupsMap.entries()].map(([key, gc]) => {
    const [start, end] = key.split('|')
    return { key, start, end, cards: gc }
  })

  // ─── 카드뉴스 슬라이드 구성 ───────────────────────────────────────────────
  type NewsContentRow = {
    id: string
    title: string
    summary_ko: string | null
    collected_at: string
    sources: { name: string } | { name: string }[] | null
  }
  const newsContentRows = (newsSlideRes.data ?? []) as unknown as NewsContentRow[]

  const insightSlides: NewsSlide[] = cards.slice(0, 5).map(card => ({
    id: `insight-${card.id}`,
    type: 'insight' as const,
    badge: '인사이트',
    topic: card.topic ?? null,
    headline: card.headline,
    summary: card.implication ?? null,
    href: `/dashboard/reports/new?type=시장동향&topic=${encodeURIComponent(card.topic ?? '')}`,
    source: null,
    date: null,
    matchNames: [card.topic, card.headline].filter((s): s is string => !!s),
    isCompetitor: false,
  }))

  const newsContentSlides: NewsSlide[] = newsContentRows.map(r => {
    const srcName = Array.isArray(r.sources)
      ? (r.sources as { name: string }[])[0]?.name ?? null
      : (r.sources as { name: string } | null)?.name ?? null
    return {
      id: `news-${r.id}`,
      type: 'news' as const,
      badge: '주요 뉴스',
      topic: null,
      headline: r.title,
      summary: r.summary_ko ?? null,
      href: `/dashboard/contents/${r.id}`,
      source: srcName,
      date: formatSlideDate(r.collected_at),
      matchNames: [r.title, r.summary_ko].filter((s): s is string => !!s),
      isCompetitor: false,
    }
  })

  // 인사이트·뉴스 교차 배치
  const newsSlides: NewsSlide[] = []
  const maxLen = Math.max(insightSlides.length, newsContentSlides.length)
  for (let i = 0; i < maxLen; i++) {
    if (insightSlides[i])     newsSlides.push(insightSlides[i])
    if (newsContentSlides[i]) newsSlides.push(newsContentSlides[i])
  }

  // ─── 이슈 ──────────────────────────────────────────────────────────────────
  const issueCards = await fetchIssueActivity(supabase)

  // ─── 지식그래프 티저 ───────────────────────────────────────────────────────
  type EntityTeaser = { id: string; canonical_name: string; entity_type: EntityType; mention_count: number }
  const entityTeasers = (entityTeaserRes.data ?? []) as EntityTeaser[]

  // ─── 키워드 트렌드 한 줄 (상승 4 + 하락 2) ───────────────────────────────
  const risingKws  = classifiedKeywords.filter(k => k.direction === '▲').slice(0, 4)
  const fallingKws = classifiedKeywords.filter(k => k.direction === '▽').slice(0, 2)
  const kwStrip    = [...risingKws, ...fallingKws]

  return (
    <div className="space-y-10">

      {/* 렌즈 스위처 */}
      <LensSwitcher />

      {/* ① 오늘의 카드뉴스 */}
      {newsSlides.length > 0 && (
        <section>
          <SectionHeader
            icon={<FileText className="h-4 w-4 text-brand-600" />}
            title="오늘의 카드뉴스"
            desc="인사이트와 주요 뉴스를 한 장씩 — 좌우로 넘겨 보세요"
          />
          <NewsCardSlider slides={newsSlides} />
        </section>
      )}

      {/* ② AI 인사이트 */}
      <section>
        <SectionHeader
          icon={<FileText className="h-4 w-4 text-brand-600" />}
          title="AI 인사이트"
          desc="이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점"
        />
        <InsightCardsSectionClient groups={insightGroups} contentMap={contentMapRecord} />
      </section>


      {/* ③ 관심 기업 인사이트 */}
      <section>
        <SectionHeader
          icon={<Building2 className="h-4 w-4 text-brand-600" />}
          title="관심 기업 인사이트"
          desc="워치리스트 기업별 AI 분석 — 헤드라인과 시사점"
        />
        {watchlist.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">마이페이지</Link>
            에서 관심 기업을 설정하면 기업별 AI 인사이트가 여기 표시됩니다.
          </p>
        ) : companyInsightGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">관심 기업 인사이트가 아직 없습니다. (생성·승인 후 표시)</p>
        ) : (
          <InsightCardsSectionClient groups={companyInsightGroups} contentMap={contentMapRecord} />
        )}
      </section>

      {/* ④ 이번 주 뜨는 토픽 + 키워드 한 줄 */}
      <section>
        <SectionHeader
          icon={<TrendingUp className="h-4 w-4 text-brand-600" />}
          title="이번 주 뜨는 토픽"
          desc="이번 주 가장 빠르게 늘어난 주제 — 직전 주 대비"
        />
        {trendingTopics.length === 0 ? (
          <p className="text-sm text-muted-foreground">이번 주 집계 데이터가 없습니다.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {trendingTopics.map((t) => (
              <Link
                key={t.group}
                href={`/dashboard/topics/${encodeURIComponent(t.group)}`}
                className="shrink-0 rounded-xl border border-border bg-card p-4 w-44 space-y-2 hover:border-brand-600/40 hover:bg-accent/40 transition-colors"
              >
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{t.group}</p>
                <div className="flex items-center gap-2">
                  {t.changePct === null ? (
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">
                      NEW
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-600">
                      ▲{t.changePct}%
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{t.cur}건</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* 키워드 트렌드 한 줄 */}
        {kwStrip.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[11px] text-muted-foreground/60">키워드</span>
            {kwStrip.map((kw) => (
              <Link
                key={kw.name}
                href={`/dashboard/topics/${encodeURIComponent(kw.name)}`}
                className={cn(
                  'shrink-0 inline-flex items-center gap-0.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  kw.direction === '▲'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100'
                )}
              >
                {kw.direction} {kw.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ⑤ 시장 주요 이슈 */}
      <section>
        <SectionHeader
          icon={<TrendingUp className="h-4 w-4 text-orange-500" />}
          title="시장 주요 이슈"
          desc="추적 이슈의 변화 — 건수·논조 변동을 확인합니다"
        />
        <IssueBoardClient cards={issueCards} showLensSwitcher={false} />
      </section>

      {/* ⑥ 경쟁사 동향 */}
      <section>
        <SectionHeader
          icon={<Building2 className="h-4 w-4 text-red-500" />}
          title="경쟁사 동향"
          desc="경쟁사가 뭘 했고 시장이 어떻게 봤나 — 최근 14일 논조"
        />
        {competitorNames.length === 0 ? (
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
                    <div className="flex items-center gap-2">
                      {hasDistData && (
                        <div className="flex items-center gap-1 text-[11px]">
                          {dist['긍정'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-medium">
                              긍 {dist['긍정']}
                            </span>
                          )}
                          {dist['중립'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-medium">
                              중 {dist['중립']}
                            </span>
                          )}
                          {dist['부정'] > 0 && (
                            <span className="rounded px-1.5 py-0.5 bg-red-100 text-red-700 font-medium">
                              부 {dist['부정']}
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        disabled
                        title="전략보고서 기능 준비 중"
                        className="rounded px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground/50 cursor-not-allowed"
                      >
                        배틀카드
                      </button>
                    </div>
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
      </section>

      {/* ⑦ 지식그래프 */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          icon={<Network className="h-4 w-4 text-brand-600" />}
          title="지식그래프"
          desc="엔티티 관계를 직접 탐색 — 기업·기술·인물·정책"
        />
        {entityTeasers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {entityTeasers.slice(0, 8).map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/entities/${e.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {e.canonical_name}
                {e.mention_count > 0 && (
                  <span className="opacity-60">{e.mention_count}</span>
                )}
              </Link>
            ))}
          </div>
        )}
        <Link
          href="/dashboard/entities"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          <Network className="h-3.5 w-3.5" />
          관계 탐색 →
        </Link>
      </section>

    </div>
  )
}
