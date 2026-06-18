import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Radar, TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'

export const metadata: Metadata = {
  title: '이슈 | Insight Out',
  description: '주요 시장 이슈 추적 보드',
}

export default async function IssuesPage() {
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Radar className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground">이슈</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          시장 주요 이슈를 추적합니다.
          {cards.length > 0 && ` ${cards.length}개 이슈 모니터링 중`}
        </p>
      </div>

      {/* 빈 상태 */}
      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed p-16 text-center text-sm text-muted-foreground">
          아직 등록된 이슈가 없습니다.
        </div>
      )}

      {/* 카드 그리드 */}
      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => {
            const isSurging = card.changePct === null || card.changePct > 30
            const total14Days = card.recentCount + card.prevCount
            const sentimentTotal = card.sentimentPos + card.sentimentNeg

            return (
              <Link
                key={card.id}
                href={`/dashboard/issues/${card.id}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-600/30 hover:bg-accent/40"
              >
                {/* 제목 + 급상승 배지 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
                    {card.title}
                  </h2>
                  {isSurging && card.recentCount > 0 && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
                      <TrendingUp className="h-3 w-3" />
                      {card.changePct === null ? '신규' : `+${card.changePct}%`}
                    </span>
                  )}
                </div>

                {/* 요약 */}
                {card.summary && (
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {card.summary}
                  </p>
                )}

                {/* 하단 메타 */}
                <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                  {/* 최근 7일 건수 */}
                  <span>
                    최근 7일 <span className="font-medium text-foreground">{card.recentCount}건</span>
                    {total14Days > card.recentCount && (
                      <span className="ml-1 opacity-60">/ 14일 {total14Days}건</span>
                    )}
                  </span>

                  {/* 논조 미니 분포 */}
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
