import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'

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

      {/* 이슈 목록 */}
      <div className="flex flex-col gap-2">
        {top.map(card => {
          const sentimentTotal = card.sentimentPos + card.sentimentNeg

          return (
            <Link
              key={card.id}
              href={`/dashboard/issues/${card.id}`}
              className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/50"
            >
              {/* 변화 감지 배지 */}
              {card.changeFlag === 'worsening' ? (
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  ⚠ 악화
                </span>
              ) : card.changeFlag === 'surge' ? (
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
                  {card.changePct === null ? '신규' : `+${card.changePct}%`}
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {card.changePct === null ? '-' : card.changePct > 0 ? `+${card.changePct}%` : `${card.changePct}%`}
                </span>
              )}

              {/* 제목 */}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-brand-600 transition-colors">
                {card.title}
              </span>

              {/* 최근 7일 + 논조 */}
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{card.recentCount}건</span>
                {sentimentTotal > 0 && (
                  <div className="flex items-center gap-1">
                    {card.sentimentPos > 0 && (
                      <span className="rounded px-1 py-0.5 bg-positive-soft text-positive">
                        긍{card.sentimentPos}
                      </span>
                    )}
                    {card.sentimentNeg > 0 && (
                      <span className="rounded px-1 py-0.5 bg-negative-soft text-negative">
                        부{card.sentimentNeg}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
