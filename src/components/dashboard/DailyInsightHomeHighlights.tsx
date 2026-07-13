import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getKstDateString } from '@/lib/date'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

/** day_of('YYYY-MM-DD')는 이미 생성 시점에 getKstDateString 으로 확정된 KST 달력일 —
 * 재변환 없이 그대로 쪼개야 Date 재구성 과정에서 생기는 자정 근처 하루 밀림을 피한다. */
function formatKstMonthDay(dayOf: string): string {
  const [, month, day] = dayOf.split('-').map(Number)
  return `${month}월 ${day}일`
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 홈 "핵심 Insight" — daily_insights(published) 소스. 오늘(day_of) 전량을 display_order
// 순으로 직접 표시(로테이션 없음). 오늘 0건이면 가장 최근 day_of 로 폴백, 그마저 0건이면 숨김.
// (구) KeyInsightHomeHighlights(주간 key_insights 로테이션)를 대체(2026-07-11) — rotation.ts 폐기.
// 주간 key_insights 아카이브(/dashboard/issues?view=brief)는 별개로 그대로 유지.

export default async function DailyInsightHomeHighlights() {
  const supabase = await createClient()

  const todayKst = getKstDateString()

  const { data: todayRows } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('status', 'published')
    .eq('day_of', todayKst)
    .order('display_order', { ascending: true })

  let cards = (todayRows ?? []) as DailyInsightRow[]

  // 오늘자가 비면 가장 최근 day_of 1건으로 폴백.
  if (cards.length === 0) {
    const { data: latestDayRows } = await supabase
      .from('daily_insights')
      .select('day_of')
      .eq('status', 'published')
      .order('day_of', { ascending: false })
      .limit(1)

    const latestDay = latestDayRows?.[0]?.day_of as string | undefined
    if (latestDay) {
      const { data: fallbackRows } = await supabase
        .from('daily_insights')
        .select('*')
        .eq('status', 'published')
        .eq('day_of', latestDay)
        .order('display_order', { ascending: true })
      cards = (fallbackRows ?? []) as DailyInsightRow[]
    }
  }

  if (cards.length === 0) return null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 border-b-2 border-foreground/80 pb-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-insight-teal-strong">
          <Sparkles className="h-3.5 w-3.5" />
          오늘의 핵심 인사이트 · {formatKstMonthDay(cards[0].day_of)}
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

      <ol className="flex flex-1 flex-col divide-y divide-border">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-1 flex-col justify-center py-4 first:pt-0 last:pb-0">
            <Link href={`/dashboard/daily-insights/${card.id}`} prefetch={false} className="group block">
              {card.category && (
                <span className="mb-1.5 inline-block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                  {card.category}
                </span>
              )}
              <h3 className="text-[17px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-700">
                {stripLlmArtifacts(card.headline)}
              </h3>
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                {stripLlmArtifacts(card.summary_ko)}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
