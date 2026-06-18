import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Sparkles, Quote, TrendingUp, Building2, Tags } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'

const WATCHLIST_LIMIT = 20
const ARTICLES_PER_COMPANY = 5

export const metadata: Metadata = {
  title: 'AI 분석 | Insight Out',
  description: 'AI가 짚는 산업 동향과 시사점',
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
  changePct: number | null // null = 신규
}

function computeTrendingTopics(
  rows: { matched_groups: string[] | null; collected_at: string }[],
  todayStartMs: number,
  topN = 6,
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
      if (isThisWeek)  curMap[g]  = (curMap[g]  ?? 0) + 1
      if (isPrevWeek)  prevMap[g] = (prevMap[g] ?? 0) + 1
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
      // 신규(prev=0) 먼저, 그 다음 changePct desc, 동률은 cur desc
      const aScore = a.changePct === null ? Infinity : a.changePct
      const bScore = b.changePct === null ? Infinity : b.changePct
      if (bScore !== aScore) return bScore - aScore
      return b.cur - a.cur
    })
    .filter(t => t.changePct === null || t.changePct >= 0) // 감소만인 토픽 제외
    .slice(0, topN)
}

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(s)} ~ ${fmt(e)}`
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function AiAnalysisPage() {
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

  // 현재 사용자 (워치리스트 조회용)
  const { data: { user } } = await supabase.auth.getUser()

  // KST 기준 날짜 경계
  const todayStart   = getKstTodayStartIso()
  const todayStartMs = new Date(todayStart).getTime()
  const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

  // 발행된 산업동향 카드 + 14일 바운디드 페치 + 워치리스트 + 경쟁사 이름 병렬 실행
  const [insightRes, trendRes, watchlistRes, competitorNamesRes] = await Promise.all([
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
      .from('keywords')
      .select('name')
      .eq('is_competitor', true)
      .limit(50),
  ])

  const cards = (insightRes.data ?? []) as InsightCard[]
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[]
  const competitorNames = (competitorNamesRes.data ?? []).map((k: { name: string }) => k.name).filter(Boolean)

  // 뜨는 토픽 집계
  type TrendRow = { matched_groups: string[] | null; collected_at: string }
  const trendingTopics = computeTrendingTopics(
    (trendRes.data ?? []) as TrendRow[],
    todayStartMs,
  )

  // 관심업체별 최근 기사 조회 (ILIKE 매칭)
  type WatchArticle = { id: string; title: string; collected_at: string; sources: { name: string } | null }
  type WatchResult = { company: string; articles: WatchArticle[] }

  const watchResults: WatchResult[] = watchlist.length > 0
    ? await Promise.all(
        watchlist.map(async ({ company }) => {
          // ILIKE에서 %·_ 이스케이프
          const escaped = company.replace(/[%_\\]/g, '\\$&')
          const { data } = await supabase
            .from('contents')
            .select('id, title, collected_at, sources(name)')
            .eq('status', 'published')
            .or(`title.ilike.%${escaped}%,summary_ko.ilike.%${escaped}%`)
            .order('collected_at', { ascending: false })
            .limit(ARTICLES_PER_COMPANY)
          return { company, articles: (data ?? []) as unknown as WatchArticle[] }
        })
      )
    : []

  // 경쟁사 기사 조회 (overlaps 매칭)
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
        if (a.sentiment === '긍정') dist['긍정']++
        else if (a.sentiment === '중립') dist['중립']++
        else if (a.sentiment === '부정') dist['부정']++
      }

      competitorResults.push({
        name: compName,
        articles: matched.slice(0, 5),
        dist,
      })
    }
  }

  // 키워드 클라우드 집계 (14일 matched_keywords 바운디드)
  const TOP_KEYWORDS_N = 30
  type KwRow = { matched_keywords: string[] | null }
  const kwFreq: Record<string, number> = {}
  for (const row of (trendRes.data ?? []) as (TrendRow & KwRow)[]) {
    if (!row.matched_keywords?.length) continue
    for (const kw of row.matched_keywords) {
      kwFreq[kw] = (kwFreq[kw] ?? 0) + 1
    }
  }
  const topKeywords = Object.entries(kwFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_KEYWORDS_N)
    .map(([name, count]) => ({ name, count }))

  // 경쟁사 분류 (keywords 테이블 join, 1회)
  const competitorSet = new Set<string>()
  if (topKeywords.length > 0) {
    const { data: kwData } = await supabase
      .from('keywords')
      .select('name, is_competitor')
      .in('name', topKeywords.map(k => k.name))
    for (const kw of (kwData ?? []) as { name: string; is_competitor: boolean }[]) {
      if (kw.is_competitor) competitorSet.add(kw.name)
    }
  }

  // 워치리스트 매칭 헬퍼 (대소문자 무시, 포함 관계)
  const watchlistLower = watchlist.map(w => w.company.toLowerCase())
  const isWatched = (name: string): boolean => {
    const lower = name.toLowerCase()
    return watchlistLower.some(e => lower === e || lower.includes(e) || e.includes(lower))
  }

  // 클라우드 폰트 크기 정규화 (12~24px)
  const kwCounts = topKeywords.map(k => k.count)
  const kwMin = kwCounts.length > 0 ? Math.min(...kwCounts) : 0
  const kwMax = kwCounts.length > 0 ? Math.max(...kwCounts) : 0
  const cloudSize = (count: number): number => {
    if (kwMax === kwMin) return 18
    return Math.round(12 + ((count - kwMin) / (kwMax - kwMin)) * 12)
  }

  // 출처 제목 1회 조회
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

  // 기간별 그룹핑
  const groups = new Map<string, InsightCard[]>()
  for (const card of cards) {
    const key = `${card.period_start}|${card.period_end}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(card)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground">AI 분석</h1>
        </div>
        <p className="text-sm text-muted-foreground">AI가 짚는 산업 동향과 시사점</p>
      </div>

      {/* 뜨는 토픽 위젯 */}
      {trendingTopics.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-foreground">이번 주 뜨는 토픽</h2>
            <span className="text-xs text-muted-foreground">직전 주 대비</span>
          </div>
          <ul className="space-y-2">
            {trendingTopics.map((t) => (
              <li key={t.group} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground truncate">{t.group}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{t.cur}건</span>
                  {t.changePct === null ? (
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">
                      NEW
                    </span>
                  ) : t.changePct > 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-600">
                      ▲{t.changePct}%
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60">
                      ▼{Math.abs(t.changePct)}%
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 키워드 맵 */}
      {topKeywords.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-foreground">키워드 맵</h2>
              <span className="text-xs text-muted-foreground">최근 14일 빈도</span>
            </div>
            {/* 범례 */}
            <div className="flex items-center gap-3 shrink-0">
              {watchlistLower.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-brand-600" />
                  관심업체
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                경쟁사
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                일반
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 leading-relaxed">
            {topKeywords.map(({ name, count }) => {
              const watched = isWatched(name)
              const isCompetitor = !watched && competitorSet.has(name)
              return (
                <Link
                  key={name}
                  href={`/dashboard/search?q=${encodeURIComponent(name)}`}
                  style={{ fontSize: `${cloudSize(count)}px` }}
                  className={cn(
                    'transition-opacity hover:opacity-75',
                    watched
                      ? 'text-brand-600 font-semibold bg-brand-600/10 rounded px-1 py-0.5'
                      : isCompetitor
                        ? 'text-red-500'
                        : 'text-muted-foreground',
                  )}
                >
                  {name}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 경쟁사 동향 */}
      <section className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-foreground">경쟁사 동향</h2>
          <span className="text-xs text-muted-foreground">최근 14일 · 논조</span>
        </div>

        {competitorNames.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
          </div>
        ) : competitorResults.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            최근 14일 경쟁사 관련 기사가 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {competitorResults.map(({ name, articles, dist }) => {
              const hasDistData = dist['긍정'] + dist['중립'] + dist['부정'] > 0
              return (
                <div key={name} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{name}</p>
                    {hasDistData && (
                      <div className="flex items-center gap-1.5 text-[11px]">
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
                  </div>
                  <ul className="space-y-1.5">
                    {articles.map(a => {
                      const sourceName = Array.isArray(a.sources)
                        ? (a.sources as { name: string }[])[0]?.name
                        : a.sources?.name
                      return (
                        <li key={a.id} className="text-xs leading-snug">
                          <div className="flex items-start gap-1.5">
                            {a.sentiment && (
                              <span className={cn(
                                'mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none',
                                a.sentiment === '긍정' && 'bg-emerald-100 text-emerald-700',
                                a.sentiment === '중립' && 'bg-muted text-muted-foreground',
                                a.sentiment === '부정' && 'bg-red-100 text-red-700',
                              )}>
                                {a.sentiment}
                              </span>
                            )}
                            <Link
                              href={`/dashboard/contents/${a.id}`}
                              className="line-clamp-2 text-foreground/90 hover:text-brand-600"
                            >
                              {a.title}
                            </Link>
                          </div>
                          <span className="mt-0.5 block text-muted-foreground/70">
                            {sourceName ? `${sourceName} · ` : ''}
                            {new Date(a.collected_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 관심업체 동향 */}
      <section className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-foreground">내 관심업체 동향</h2>
        </div>

        {watchlist.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            관심업체를 추가하면 여기서 동향을 볼 수 있습니다.{' '}
            <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">
              마이페이지에서 추가하기 →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {watchResults.map(({ company, articles }) => (
              <div
                key={company}
                className="rounded-xl border border-border bg-card p-4 space-y-2"
              >
                <p className="text-sm font-semibold text-foreground">{company}</p>
                {articles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">최근 동향 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {articles.map(a => {
                      const sourceName = Array.isArray(a.sources)
                        ? (a.sources as { name: string }[])[0]?.name
                        : a.sources?.name
                      return (
                        <li key={a.id} className="text-xs leading-snug">
                          <Link
                            href={`/dashboard/contents/${a.id}`}
                            className="line-clamp-2 text-foreground/90 hover:text-brand-600"
                          >
                            {a.title}
                          </Link>
                          <span className="mt-0.5 block text-muted-foreground/70">
                            {sourceName ? `${sourceName} · ` : ''}
                            {new Date(a.collected_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 빈 상태 */}
      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          아직 발행된 인사이트가 없습니다.
        </div>
      )}

      {/* 기간별 카드 그룹 */}
      <div className="space-y-10">
        {[...groups.entries()].map(([key, groupCards]) => {
          const [start, end] = key.split('|')
          return (
            <section key={key}>
              {/* 기간 헤더 */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {formatPeriod(start, end)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* 카드 목록 */}
              <div className="grid gap-4 sm:grid-cols-2">
                {groupCards.map((card) => {
                  const citations = card.citations as InsightCardCitation[]
                  return (
                    <article
                      key={card.id}
                      className="rounded-xl border border-border bg-card p-5 space-y-3"
                    >
                      {/* 토픽 배지 */}
                      <div className="flex items-center gap-2">
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-brand-600/10 text-brand-600">
                          {card.topic}
                        </span>
                      </div>

                      {/* 헤드라인 */}
                      <p className="text-base font-semibold text-foreground leading-snug">
                        {card.headline}
                      </p>

                      {/* 시사점 */}
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

                      {/* 출처 인용 */}
                      {citations.length > 0 ? (
                        <div className="space-y-2 pt-1 border-t border-border">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                            인용 출처
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
                        /* 폴백: source_content_ids 링크 목록 */
                        <div className="space-y-1.5 pt-1 border-t border-border">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                            관련 기사
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
            </section>
          )
        })}
      </div>
    </div>
  )
}
