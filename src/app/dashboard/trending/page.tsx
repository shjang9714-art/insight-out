import type { Metadata } from 'next'
import { TrendingUp } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import { fetchIssueActivity } from '@/lib/issues/activity'
import { fetchTrendingEvents, TRENDING_LIMIT } from '@/lib/issues/trending'
import IssueRankTicker, { type TickerIssue } from '@/components/dashboard/IssueRankTicker'
import BackLink from '@/components/contents/BackLink'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '실시간 급상승 전체 순위 | Insight Out',
  description: '지금 가장 빠르게 발행량이 늘고 있는 사건을 순위로 확인하세요.',
}

/** IssueSignals.tsx의 폴백과 동일 로직 — trending_keywords/trending_issue_articles 뷰 미배포 시 대비. */
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
      contentId: null,
      title: card.title,
      recentCount: card.recentCount,
      changePct: card.changePct,
      changeFlag: card.changeFlag,
      sentimentPos: card.sentimentPos,
      sentimentNeg: card.sentimentNeg,
    }))
}

export default async function TrendingPage() {
  const events = await fetchTrendingEvents()

  const all: TickerIssue[] = events
    ? events.map(e => ({
        id: e.issueId,
        contentId: e.contentId,
        title: e.headline,
        entityChip: e.entityChip,
        recentCount: e.recentCount,
        changePct: e.changePct,
        changeFlag: e.changeFlag,
        sentimentPos: 0,
        sentimentNeg: 0,
      }))
    : await fetchFallbackTop()

  return (
    <PageContainer>
      <div className="mb-4">
        <BackLink
          fallbackHref="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <div className="mb-6 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-orange-500" />
        <h1 className="text-xl font-bold text-foreground">실시간 급상승 전체 순위</h1>
      </div>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          최근 급상승 이슈가 없습니다.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-2">
          <IssueRankTicker issues={all} visibleRows={all.length} />
        </div>
      )}
    </PageContainer>
  )
}
