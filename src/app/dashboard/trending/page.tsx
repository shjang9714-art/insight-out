import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TrendingUp } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import { fetchIssueActivity } from '@/lib/issues/activity'
import { fetchTrendingEvents, TRENDING_LIMIT } from '@/lib/issues/trending'
import { getKstDateString } from '@/lib/date'
import IssueRankTicker, { type TickerIssue } from '@/components/dashboard/IssueRankTicker'
import BackLink from '@/components/BackLink'
import TrendingHistoryPicker from '@/components/dashboard/TrendingHistoryPicker'
import { fetchTrendingSnapshot } from '@/lib/issues/trending-snapshot'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '오늘의 급상승 전체 순위 | Insight Out',
  description: '오늘 가장 빠르게 발행량이 늘고 있는 사건을 순위로 확인하세요.',
}

function formatKstMonthDay(dayOf: string): string {
  const [, month, day] = dayOf.split('-').map(Number)
  return `${month}월 ${day}일`
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
      topHashtag: card.topKeywords[0] ?? null,
      recentCount: card.recentCount,
      todayCount: card.recentCount, // 폴백 집계엔 일자별 필터가 없어 최근 집계로 대체
      changePct: card.changePct,
      changeFlag: card.changeFlag,
      sentimentPos: card.sentimentPos,
      sentimentNeg: card.sentimentNeg,
    }))
}

type SearchParams = Promise<{ date?: string }>

function TrendingRankingSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <div className="space-y-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-6 w-14 rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

async function TrendingRanking({ selectedDate, isToday }: { selectedDate: string; isToday: boolean }) {
  let all: TickerIssue[]
  // 기준일이 실제 오늘(KST)이 아니면(크론 전 새벽 등) "오늘"이라 부르지 않고 날짜로 표시 —
  // 과거 데이터를 "오늘"로 표시하던 옛 버그(2026-07-12) 재발 방지. 히스토리(!isToday) 조회는
  // 사용자가 명시적으로 고른 과거 날짜이므로 항상 날짜 표기.
  let dayLabel = formatKstMonthDay(selectedDate)

  if (isToday) {
    const trending = await fetchTrendingEvents()
    if (trending) {
      dayLabel = trending.asOfDateKst === selectedDate ? '오늘' : formatKstMonthDay(trending.asOfDateKst)
      all = trending.events.map(e => ({
        id: e.issueId,
        contentId: e.contentId,
        title: e.headline,
        entityChip: e.entityChip,
        topHashtag: e.topHashtag,
        recentCount: e.recentCount,
        todayCount: e.todayCount,
        changePct: e.changePct,
        changeFlag: e.changeFlag,
        sentimentPos: 0,
        sentimentNeg: 0,
      }))
    } else {
      all = await fetchFallbackTop()
    }
  } else {
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

    const snapshot = await fetchTrendingSnapshot(supabase, selectedDate)
    all = snapshot.map(s => ({
      id: s.issueId,
      contentId: s.contentId,
      title: s.headline,
      topHashtag: s.hashtag,
      recentCount: s.todayCount,
      todayCount: s.todayCount,
      changePct: null,
      changeFlag: null,
      sentimentPos: 0,
      sentimentNeg: 0,
    }))
  }

  if (all.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {isToday ? '최근 급상승 이슈가 없습니다.' : '이 날짜는 기록이 없습니다.'}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <IssueRankTicker issues={all} visibleRows={all.length} dayLabel={dayLabel} />
    </div>
  )
}

export default async function TrendingPage({ searchParams }: { searchParams: SearchParams }) {
  const { date } = await searchParams
  const todayKst = getKstDateString()
  const hasExplicitDateParam = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date))
  const selectedDate = hasExplicitDateParam ? date! : todayKst
  const isToday = selectedDate === todayKst

  // 헤더 날짜 라벨은 항상 실제 기준일(asOfDateKst)을 따른다 — isToday일 때 selectedDate(=
  // todayKst)를 그대로 쓰면 당일 크론(05:00 KST) 전 새벽엔 헤더는 "오늘"인데 실제 랭킹
  // 데이터는 어제자인 불일치가 재발한다. fetchTrendingEvents()는 unstable_cache로 캐시돼
  // 있어 아래 TrendingRanking의 내부 호출과 중복 비용(LLM 재호출 등) 없이 라벨만 얻는다.
  const headerDateLabel = isToday
    ? formatKstMonthDay((await fetchTrendingEvents())?.asOfDateKst ?? selectedDate)
    : formatKstMonthDay(selectedDate)

  return (
    <PageContainer>
      <div className="mb-4">
        <BackLink
          fallbackHref="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <TrendingUp className="h-5 w-5 text-orange-500" />
        <h1 className="text-xl font-bold text-foreground">오늘의 급상승 전체 순위</h1>
        <span className="text-sm text-muted-foreground">{headerDateLabel}</span>
        <div className="ml-auto">
          <TrendingHistoryPicker selectedDate={selectedDate} todayKst={todayKst} />
        </div>
      </div>

      <Suspense fallback={<TrendingRankingSkeleton />}>
        <TrendingRanking selectedDate={selectedDate} isToday={isToday} />
      </Suspense>
    </PageContainer>
  )
}
