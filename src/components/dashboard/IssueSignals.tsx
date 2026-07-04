import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'
import IssueRankTicker from './IssueRankTicker'

export default async function IssueSignals() {
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

  const cards = await fetchIssueActivity(supabase)
  const top = cards.filter(c => c.recentCount > 0 || c.changePct === null).slice(0, 5)

  if (top.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-foreground">급상승 이슈</h2>
          <span className="text-[11px] text-muted-foreground">이번 주</span>
        </div>
        <Link
          href="/dashboard/issues"
          className="text-[11px] text-brand-600 hover:underline"
        >
          전체 보기 →
        </Link>
      </div>

      {/* 이슈 목록 — 실검 스타일 순번 롤링 (클라이언트) */}
      <IssueRankTicker
        issues={top.map(card => ({
          id: card.id,
          title: card.title,
          recentCount: card.recentCount,
          changePct: card.changePct,
          changeFlag: card.changeFlag,
          sentimentPos: card.sentimentPos,
          sentimentNeg: card.sentimentNeg,
        }))}
      />
    </div>
  )
}
