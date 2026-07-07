import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'
import { fetchTrendingEvents, TRENDING_LIMIT } from '@/lib/issues/trending'
import IssueRankTicker, { type TickerIssue } from './IssueRankTicker'

/** trending_keywords/trending_issue_articles 뷰 미적용 시 기존 주간 활동량 집계로 폴백. */
async function fetchFallbackTop(): Promise<TickerIssue[]> {
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

  return (await fetchIssueActivity(supabase))
    .filter(c => c.recentCount > 0 || c.changePct === null)
    .slice(0, TRENDING_LIMIT)
    .map(card => ({
      id: card.id,
      title: card.title,
      recentCount: card.recentCount,
      changePct: card.changePct,
      changeFlag: card.changeFlag,
      sentimentPos: card.sentimentPos,
      sentimentNeg: card.sentimentNeg,
    }))
}

export default async function IssueSignals() {
  // "실시간 급상승" = trending_keywords 뷰(48h 발행건수 후보) 위에 이슈 내부
  // 서브이벤트 클러스터링(§5)을 얹어 특정 사건 단위로 노출. 뷰 미적용 시(42P01/PGRST205)
  // 기존 주간 활동량 집계로 폴백 — 섹션이 빈 화면이 되지 않게.
  const events = await fetchTrendingEvents()

  const top: TickerIssue[] = events
    ? events.map(e => ({
        id: e.issueId,
        title: e.headline,
        entityChip: e.entityChip,
        recentCount: e.recentCount,
        changePct: e.changePct,
        changeFlag: e.changeFlag,
        sentimentPos: 0,
        sentimentNeg: 0,
      }))
    : await fetchFallbackTop()

  if (top.length === 0) return null

  return (
    // 실검 스트립 — 카드가 아닌 한 줄 바. 제목만 휘리릭 롤링.
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-2 ring-1 ring-border/60">
      <div className="flex shrink-0 items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-orange-500" />
        <span className="whitespace-nowrap text-xs font-semibold text-foreground">실시간 급상승</span>
      </div>

      {/* 한 줄 롤링(클라이언트) */}
      <div className="min-w-0 flex-1">
        <IssueRankTicker compact issues={top} />
      </div>

      <Link
        href="/dashboard/issues"
        className="shrink-0 whitespace-nowrap text-[11px] text-brand-600 hover:underline"
      >
        전체 →
      </Link>
    </div>
  )
}
