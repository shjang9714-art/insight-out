import type React from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp, FileText } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation, WatchlistItem } from '@/lib/types'
import { tagTypeToBucket } from '@/lib/tag-buckets'
import { fetchIssueActivity } from '@/lib/issues/activity'
import type { KeywordItem } from '@/components/dashboard/KeywordMap'
import LensSwitcher from '@/components/lens/LensSwitcher'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import InsightBriefCard from '@/components/analysis/InsightBriefCard'
import {
  buildRuleBrief,
  enhanceBriefWithLlm,
  RISK_VOCAB,
  type BriefInput,
} from '@/lib/briefing/insight-brief'

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


// ─── 뷰 ───────────────────────────────────────────────────────────────────────

export default async function AiInsightsView({ view = 'briefing' }: { view?: 'briefing' | 'issues' | 'mine' }) {
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

  const [insightRes, trendRes, watchlistRes, keywordGroupsRes] = await Promise.all([
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
      .from('keyword_groups')
      .select('name, tag_type, include_patterns')
      .eq('is_active', true)
      .limit(200),
  ])

  const cards = (insightRes.data ?? []) as InsightCard[]
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[]

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

  const classifiedKeywords: KeywordItem[] = topKeywords.map(({ name, count }) => {
    const watched = isWatched(name)
    const tagType = patternTagMap.get(name.toLowerCase())
    const bucket = tagTypeToBucket(tagType)
    const cur  = kwCurFreq[name]  ?? 0
    const prev = kwPrevFreq[name] ?? 0
    const direction: '▲' | '▽' | null = cur > prev ? '▲' : cur < prev ? '▽' : null
    return { name, count, size: 14, bucket, watched, isCompetitor: false, direction }
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

  // ─── 브리핑 입력 구성 ─────────────────────────────────────────────────────
  const risingKwNames = classifiedKeywords.filter(k => k.direction === '▲').map(k => k.name)
  const watchlistHits = watchlist
    .filter(w => risingKwNames.some(kw => {
      const kl = kw.toLowerCase(); const wl = w.company.toLowerCase()
      return kl === wl || kl.includes(wl) || wl.includes(kl)
    }))
    .map(w => {
      const matchedKw = risingKwNames.find(kw => {
        const kl = kw.toLowerCase(); const wl = w.company.toLowerCase()
        return kl === wl || kl.includes(wl) || wl.includes(kl)
      })
      return { company: w.company, count: kwCurFreq[matchedKw ?? ''] ?? 1 }
    })
  const riskKeywords = risingKwNames.filter(kw => RISK_VOCAB.some(r => kw.includes(r)))
  const briefInput: BriefInput = { trendingTopics, risingKeywords: risingKwNames, watchlistHits, riskKeywords }
  const ruleBrief = buildRuleBrief(briefInput)
  const brief = view === 'briefing' ? await enhanceBriefWithLlm(ruleBrief, briefInput) : ruleBrief

  // ─── 이슈 (이슈 탭 전용) ─────────────────────────────────────────────────
  const issueCards = view === 'issues' ? await fetchIssueActivity(supabase) : []

  // ─── 내 관점 데이터 ───────────────────────────────────────────────────────
  const watchedKwStrip = classifiedKeywords.filter(k => k.watched && k.direction !== null).slice(0, 8)
  const mineInsightGroups = insightGroups.map(g => ({
    ...g,
    cards: g.cards.filter(c => c.topic && isWatched(c.topic)),
  })).filter(g => g.cards.length > 0)

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">

      {/* 브리핑 탭 */}
      {view === 'briefing' && (
        <>
          {/* 이번 주 AI 브리핑 요약 카드 */}
          <InsightBriefCard brief={brief} />

          {/* ① AI 인사이트 */}
          <section>
            <SectionHeader
              icon={<FileText className="h-4 w-4 text-brand-600" />}
              title="AI 인사이트"
              desc="이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점"
            />
            <InsightCardsSectionClient groups={insightGroups} contentMap={contentMapRecord} />
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
                        <span className="text-[11px] font-semibold text-positive">
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
                        ? 'border-positive/30 bg-positive-soft text-positive hover:bg-positive-soft/80'
                        : 'border-negative/30 bg-negative-soft text-negative hover:bg-negative-soft/80'
                    )}
                  >
                    {kw.direction} {kw.name}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* 이슈 탭 */}
      {view === 'issues' && (
        <section>
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4 text-risk" />}
            title="시장 주요 이슈"
            desc="추적 이슈의 변화 — 건수·논조 변동을 확인합니다"
          />
          <IssueBoardClient cards={issueCards} showLensSwitcher={false} />
        </section>
      )}

      {/* 내 관점 탭 */}
      {view === 'mine' && (
        <>
          {brief.myImplication && watchlist.length > 0 && (
            <div className="rounded-lg border-l-2 border-brand-600/60 bg-brand-600/5 px-4 py-3">
              <p className="text-[11px] font-semibold text-brand-600 mb-0.5">내 업무 시사점</p>
              <p className="text-sm text-foreground leading-snug">{brief.myImplication}</p>
            </div>
          )}

          <LensSwitcher />

          {watchlist.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">아직 관심 기업이 없습니다</p>
              <p className="text-xs text-muted-foreground">
                <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">마이페이지</Link>
                에서 관심 기업을 설정하면 맞춤 인사이트를 여기서 확인할 수 있어요.
              </p>
            </div>
          ) : (
            <>
              {/* 내 관심 키워드 트렌드 */}
              {watchedKwStrip.length > 0 && (
                <section>
                  <SectionHeader
                    icon={<TrendingUp className="h-4 w-4 text-brand-600" />}
                    title="내 관심사 키워드 동향"
                    desc="관심 기업·토픽 키워드의 이번 주 방향"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {watchedKwStrip.map((kw) => (
                      <Link
                        key={kw.name}
                        href={`/dashboard/topics/${encodeURIComponent(kw.name)}`}
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                          kw.direction === '▲'
                            ? 'border-positive/30 bg-positive-soft text-positive hover:bg-positive-soft/80'
                            : 'border-negative/30 bg-negative-soft text-negative hover:bg-negative-soft/80'
                        )}
                      >
                        {kw.direction} {kw.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* 내 관심사 매칭 인사이트 */}
              <section>
                <SectionHeader
                  icon={<FileText className="h-4 w-4 text-brand-600" />}
                  title="내 관심사 인사이트"
                  desc="관심 기업·토픽과 겹치는 AI 인사이트"
                />
                {mineInsightGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    관심 기업과 연관된 인사이트가 아직 없습니다. (AI 생성·승인 후 표시)
                  </p>
                ) : (
                  <InsightCardsSectionClient groups={mineInsightGroups} contentMap={contentMapRecord} />
                )}
              </section>
            </>
          )}
        </>
      )}

    </div>
  )
}
