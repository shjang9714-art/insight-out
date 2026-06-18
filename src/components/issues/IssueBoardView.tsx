import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'

export default async function IssueBoardView() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const cards = await fetchIssueActivity(supabase)

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          시장 주요 이슈를 추적합니다.
          {cards.length > 0 && ` ${cards.length}개 이슈 모니터링 중`}
        </p>
      </div>

      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed p-16 text-center text-sm text-muted-foreground">
          아직 등록된 이슈가 없습니다.
        </div>
      )}

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => {
            const total14Days = card.recentCount + card.prevCount
            const sentimentTotal = card.sentimentPos + card.sentimentNeg

            return (
              <Link
                key={card.id}
                href={`/dashboard/issues/${card.id}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-600/30 hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
                    {card.title}
                  </h2>
                  {card.changeFlag === 'worsening' && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      ⚠ 논조 악화
                    </span>
                  )}
                  {card.changeFlag === 'surge' && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
                      <TrendingUp className="h-3 w-3" />
                      {card.changePct === null ? '신규' : `+${card.changePct}%`}
                    </span>
                  )}
                </div>

                {card.summary && (
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {card.summary}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    최근 7일 <span className="font-medium text-foreground">{card.recentCount}건</span>
                    {total14Days > card.recentCount && (
                      <span className="ml-1 opacity-60">/ 14일 {total14Days}건</span>
                    )}
                  </span>

                  {sentimentTotal > 0 && (
                    <div className="flex items-center gap-1">
                      {card.sentimentPos > 0 && (
                        <span className="rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700">
                          긍{card.sentimentPos}
                        </span>
                      )}
                      {card.sentimentNeg > 0 && (
                        <span className="rounded px-1.5 py-0.5 bg-red-50 text-red-600">
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
      )}
    </div>
  )
}
