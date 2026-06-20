import type React from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Quote, TrendingUp, Building2, Network, FileText } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import type { EntityType } from '@/lib/types'
import { tagTypeToBucket } from '@/lib/tag-buckets'
import { fetchIssueActivity } from '@/lib/issues/activity'
import type { KeywordItem } from '@/components/dashboard/KeywordMap'

const WATCHLIST_LIMIT = 20

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

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(s)} ~ ${fmt(e)}`
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

  const [insightRes, trendRes, watchlistRes, competitorNamesRes, keywordGroupsRes, entityTeaserRes] = await Promise.all([
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

  // ─── 관심업체 (키워드 분류용, 섹션 렌더 없음) ────────────────────────────
  const watchlistLower = watchlist.map(w => w.company.toLowerCase())
  const isWatched = (name: string): boolean => {
    const lower = name.toLowerCase()
    return watchlistLower.some(e => lower === e || lower.includes(e) || e.includes(lower))
  }

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

  const groups = new Map<string, InsightCard[]>()
  for (const card of cards) {
    const key = `${card.period_start}|${card.period_end}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(card)
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

      {/* ① AI 인사이트 — 최상단 */}
      <section>
        <SectionHeader
          icon={<FileText className="h-4 w-4 text-brand-600" />}
          title="AI 인사이트"
          desc="이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점"
        />
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">AI 인사이트 생성 대기 중</p>
            <p className="mt-1 text-xs text-muted-foreground">
              어드민에서 인사이트 카드를 생성하면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {[...groups.entries()].map(([key, groupCards], idx) => {
              const [start, end] = key.split('|')
              const isLatest = idx === 0
              return (
                <div key={key} className={cn(!isLatest && 'opacity-70')}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={cn(
                      'text-sm font-medium',
                      isLatest ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {formatPeriod(start, end)}
                    </span>
                    {isLatest && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">최신</span>
                    )}
                    {!isLatest && (
                      <span className="text-[11px] text-muted-foreground/60">이전 인사이트</span>
                    )}
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {groupCards.map((card) => {
                      const citations = card.citations as InsightCardCitation[]
                      return (
                        <article
                          key={card.id}
                          className="rounded-xl border border-border bg-card p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded px-2 py-0.5 text-xs font-medium bg-brand-600/10 text-brand-600">
                              {card.topic}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/dashboard/reports/new?type=시장동향&topic=${encodeURIComponent(card.topic ?? '')}`}
                                className="rounded px-2 py-0.5 text-[11px] font-medium bg-brand-600/10 text-brand-600 hover:bg-brand-600/20 transition-colors"
                              >
                                보고서로 만들기
                              </Link>
                            </div>
                          </div>

                          <p className="text-base font-semibold text-foreground leading-snug">
                            {card.headline}
                          </p>

                          {card.implication && (
                            <div className="space-y-0.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                시사점
                              </span>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {card.implication}
                              </p>
                            </div>
                          )}

                          {citations.length > 0 ? (
                            <div className="space-y-2 pt-1 border-t border-border">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                근거
                              </span>
                              <ul className="space-y-2">
                                {citations.map((c, i) => {
                                  const meta = contentMap.get(c.content_id)
                                  return (
                                    <li key={i} className="flex gap-2">
                                      <Quote className="h-3 w-3 mt-0.5 shrink-0 text-brand-600/40" />
                                      <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground italic leading-snug">
                                          &ldquo;{c.quote}&rdquo;
                                        </p>
                                        {meta ? (
                                          <Link
                                            href={`/dashboard/contents/${c.content_id}`}
                                            className="mt-0.5 block text-[11px] text-brand-600 hover:underline truncate"
                                          >
                                            {meta.title}
                                          </Link>
                                        ) : (
                                          <span className="mt-0.5 block text-[11px] text-muted-foreground/60 truncate">
                                            출처 비공개
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          ) : card.source_content_ids.length > 0 ? (
                            <div className="space-y-1.5 pt-1 border-t border-border">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                근거
                              </span>
                              <ul className="space-y-1">
                                {card.source_content_ids.slice(0, 5).map((id) => {
                                  const meta = contentMap.get(id)
                                  return meta ? (
                                    <li key={id}>
                                      <Link
                                        href={`/dashboard/contents/${id}`}
                                        className="block text-xs text-brand-600 hover:underline truncate"
                                      >
                                        {meta.title}
                                      </Link>
                                    </li>
                                  ) : null
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ② 이번 주 뜨는 토픽 + 키워드 한 줄 */}
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

      {/* ③ 시장 주요 이슈 */}
      <section>
        <SectionHeader
          icon={<TrendingUp className="h-4 w-4 text-orange-500" />}
          title="시장 주요 이슈"
          desc="추적 이슈의 변화 — 건수·논조 변동을 확인합니다"
        />
        {issueCards.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            아직 등록된 이슈가 없습니다.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {issueCards.map(card => {
              const total14Days = card.recentCount + card.prevCount
              const sentimentTotal = card.sentimentPos + card.sentimentNeg
              return (
                <div
                  key={card.id}
                  className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-600/30 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <Link
                      href={`/dashboard/issues/${card.id}`}
                      className="min-w-0"
                    >
                      <h3 className="text-xs font-semibold text-foreground leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
                        {card.title}
                      </h3>
                    </Link>
                    {card.changeFlag === 'worsening' && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        ⚠ 논조 악화
                      </span>
                    )}
                    {card.changeFlag === 'surge' && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
                        <TrendingUp className="h-2.5 w-2.5" />
                        {card.changePct === null ? '신규' : `+${card.changePct}%`}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      7일 <span className="font-medium text-foreground">{card.recentCount}건</span>
                      {total14Days > card.recentCount && (
                        <span className="ml-1 opacity-60">/ 14일 {total14Days}</span>
                      )}
                    </span>
                    {sentimentTotal > 0 && (
                      <div className="flex items-center gap-1">
                        {card.sentimentPos > 0 && (
                          <span className="rounded px-1 py-0.5 bg-emerald-50 text-emerald-700">긍{card.sentimentPos}</span>
                        )}
                        {card.sentimentNeg > 0 && (
                          <span className="rounded px-1 py-0.5 bg-red-50 text-red-600">부{card.sentimentNeg}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-2 border-t border-border">
                    <Link
                      href={`/dashboard/reports/new?issue=${card.id}`}
                      className="text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      보고서로 만들기 →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ④ 경쟁사 동향 */}
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

      {/* ⑤ 지식그래프 */}
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
