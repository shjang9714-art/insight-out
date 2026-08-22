import Link from 'next/link'
import { ArrowUpRight, Clock3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getKstDateString, daysBetweenKstDateStrings } from '@/lib/date'
import { formatMonthWeekLabel } from '@/lib/daily-insights/weeks'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { pickRotatedWindow } from '@/lib/daily-insights/home-rotation'
import CategoryBadge from '@/components/daily-insights/CategoryBadge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import AiMark from '@/components/ui/AiMark'

// 3C 3줄 미리보기 — 페이지(1단계)의 전문과 달리 한 줄로 축약(§3).
const TREND_PREVIEW: { key: 'market_trend' | 'competitor_trend' | 'implication'; label: string }[] = [
  { key: 'market_trend', label: '시장' },
  { key: 'competitor_trend', label: '경쟁사' },
  { key: 'implication', label: '시사점' },
]

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 홈 "핵심 인사이트" — daily_insights(published) 소스. 이번 주(최근 week_of) 적재분을
// 주(week_of) 시드로 한 번 고정 셔플한 뒤 날짜별 스텝-윈도우로 3건 로테이션 표시
// (§20260822, 순수 랜덤 셔플은 인접일 겹침 체감 문제로 폐기). 이번 주 0건이면 가장
// 최근 week_of 로 폴백, 그마저 0건이면 숨김.
// (구) "오늘(day_of) 전량 표시(로테이션 없음)" 방식을 대체 — 매일→매주 발행 전환에 맞춤.

export default async function DailyInsightHomeHighlights() {
  const supabase = await createClient()

  const { data: weekRows } = await supabase
    .from('daily_insights')
    .select('week_of')
    .eq('status', 'published')
    .not('week_of', 'is', null)
    .order('week_of', { ascending: false })
    .limit(1)

  const latestWeek = weekRows?.[0]?.week_of as string | undefined
  if (!latestWeek) return null

  const { data: weekInsights } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('status', 'published')
    .eq('week_of', latestWeek)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  const pool = (weekInsights ?? []) as DailyInsightRow[]
  if (pool.length === 0) return null

  // id 기준 정렬로 안정적 기준 순서를 만든 뒤 스텝-윈도우 로테이션에 넘긴다.
  const sortedPool = [...pool].sort((a, b) => a.id.localeCompare(b.id))
  const todayKst = getKstDateString()
  const daysSinceWeekOf = daysBetweenKstDateStrings(latestWeek, todayKst)
  const cards = pickRotatedWindow(sortedPool, 3, latestWeek, daysSinceWeekOf)

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 border-b-2 border-foreground/80 pb-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-insight-teal-strong">
          <AiMark title="AI 생성 인사이트" />
          이번 주 핵심 인사이트 · {formatMonthWeekLabel(latestWeek)}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">주목하세요, 핵심 Insight</h2>
          <Link
            href="/dashboard/issues?view=brief"
            className="group inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-brand-700"
          >
            핵심 Insight 보러가기
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">
          LG U+ Strategy Brief
        </p>
      </div>

      <ol className="flex flex-1 flex-col gap-3">
        {cards.map((card) => {
          const sourceCount = card.source_articles?.length ?? 0
          const pastCount = card.related_past?.length ?? 0
          const repSource = card.source_articles?.[0]?.source ?? null
          const extraSourceCount = Math.max(0, sourceCount - 1)
          const publishedAt = card.source_articles?.[0]?.published_at ?? null

          return (
            <li key={card.id} className="relative rounded-xl border border-border/70 bg-background/40">
              <Link href={`/dashboard/daily-insights/${card.id}`} prefetch={false} className="group block px-4 py-3.5">
                {/* 배지줄 */}
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {card.category && <CategoryBadge category={card.category} />}
                  <Badge variant="secondary" className="bg-brand-600/10 text-brand-700 dark:text-brand-300">
                    NEW
                  </Badge>
                  {pastCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <Clock3 className="h-2.5 w-2.5" />
                      과거 {pastCount}
                    </Badge>
                  )}
                </div>

                <h3 className="text-[16px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-700">
                  {stripLlmArtifacts(card.headline)}
                </h3>

                {card.why_it_matters && (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    🎯 {stripLlmArtifacts(card.why_it_matters)}
                  </p>
                )}

                {/* 3C 미리보기 — 라벨은 칩, 본문은 잘리지 않고 끝까지 표시(시사점만 강조) */}
                <ul className="mt-2 space-y-1.5">
                  {TREND_PREVIEW.map(({ key, label }) => {
                    const value = card[key]
                    if (!value) return null
                    const isImplication = key === 'implication'
                    return (
                      <li key={key} className="flex items-start gap-1.5 text-[12px] leading-relaxed">
                        <span
                          className={cn(
                            'mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            isImplication
                              ? 'bg-brand-600/15 text-brand-700 dark:text-brand-300'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {label}
                        </span>
                        <span
                          className={cn(
                            isImplication ? 'font-medium text-brand-700 dark:text-brand-300' : 'text-muted-foreground'
                          )}
                        >
                          {stripLlmArtifacts(value)}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                {/* 하단 메타 */}
                <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground/80">
                  <span className="truncate">
                    {repSource ? repSource : '출처 미상'}
                    {extraSourceCount > 0 ? ` 외 ${extraSourceCount}곳` : ''}
                    {publishedAt ? ` · ${publishedAt}` : ''}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-muted-foreground/70 transition-colors group-hover:text-brand-700">
                    상세 보기
                    <ArrowUpRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
