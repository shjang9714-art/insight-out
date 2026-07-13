import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { TrendingUp } from 'lucide-react'
import { fetchIssueActivity } from '@/lib/issues/activity'
import { fetchTrendingEvents, TRENDING_LIMIT } from '@/lib/issues/trending'
import { getKstDateString } from '@/lib/date'
import IssueRankTicker, { type TickerIssue } from './IssueRankTicker'

function formatKstMonthDay(dayOf: string): string {
  const [, month, day] = dayOf.split('-').map(Number)
  return `${month}월 ${day}일`
}

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
      contentId: null, // 폴백 집계는 기사 단위 정보가 없음 — 이슈 상세로 대체
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

export default async function IssueSignals() {
  // "실시간 급상승" = trending_keywords 뷰(48h 발행건수 후보) 위에 이슈 내부
  // 서브이벤트 클러스터링(§5)을 얹어 특정 사건 단위로 노출. 뷰 미적용 시(42P01/PGRST205)
  // 기존 주간 활동량 집계로 폴백 — 섹션이 빈 화면이 되지 않게.
  const trending = await fetchTrendingEvents()

  const top: TickerIssue[] = trending
    ? trending.events.map(e => ({
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
    : await fetchFallbackTop()

  if (top.length === 0) return null

  // 기준일(asOfDateKst) — 오늘(KST)에 후보 기사가 있으면 오늘, 없으면(당일 크론 05:00 KST
  // 전 새벽 등) 데이터가 있는 가장 최근 직전 날짜로 자동 전환된다. 폴백 집계는 일자 정보가
  // 없어 현재 KST 날짜를 그대로 쓴다(기존 동작 유지).
  const basisDateKst = trending?.asOfDateKst ?? getKstDateString()
  const isBasisToday = basisDateKst === getKstDateString()
  const todayLabel = formatKstMonthDay(basisDateKst)
  // 헤더 라벨뿐 아니라 각 행 "오늘 N건" 문구도 기준일을 따라간다 — 기준일이 오늘이 아니면
  // "오늘"이라 부르지 않고 날짜로 표시(과거 데이터를 "오늘"로 표시하던 옛 버그 재발 방지).
  const dayLabel = isBasisToday ? '오늘' : todayLabel

  return (
    // 실검 스트립 — 카드가 아닌 한 줄 바. 제목만 휘리릭 롤링.
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-2 ring-1 ring-border/60">
      <div className="flex shrink-0 items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-orange-500" />
        <span className="whitespace-nowrap text-xs font-semibold text-foreground">오늘의 급상승</span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{todayLabel}</span>
      </div>

      {/* 한 줄 롤링(클라이언트) */}
      <div className="min-w-0 flex-1">
        <IssueRankTicker compact issues={top} dayLabel={dayLabel} />
      </div>

      <Link
        href="/dashboard/trending"
        className="shrink-0 whitespace-nowrap text-[11px] text-brand-600 hover:underline"
      >
        전체 →
      </Link>
    </div>
  )
}
