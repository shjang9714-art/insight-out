import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Sparkles, Quote, TrendingUp } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import type { InsightCard, InsightCardCitation } from '@/lib/types'

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

  // KST 기준 날짜 경계
  const todayStart   = getKstTodayStartIso()
  const todayStartMs = new Date(todayStart).getTime()
  const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()

  // 발행된 산업동향 카드 + 14일 바운디드 페치 병렬 실행
  const [insightRes, trendRes] = await Promise.all([
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
      .select('matched_groups, collected_at')
      .eq('status', 'published')
      .gte('collected_at', fourteenDaysStart)
      .limit(1000),
  ])

  const cards = (insightRes.data ?? []) as InsightCard[]

  // 뜨는 토픽 집계
  type TrendRow = { matched_groups: string[] | null; collected_at: string }
  const trendingTopics = computeTrendingTopics(
    (trendRes.data ?? []) as TrendRow[],
    todayStartMs,
  )

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
