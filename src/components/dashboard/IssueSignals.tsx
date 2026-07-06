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
  const top = cards.filter(c => c.recentCount > 0 || c.changePct === null).slice(0, 15)

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
        <IssueRankTicker
          compact
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

      <Link
        href="/dashboard/issues"
        className="shrink-0 whitespace-nowrap text-[11px] text-brand-600 hover:underline"
      >
        전체 →
      </Link>
    </div>
  )
}
