import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getKstTodayStartIso } from '@/lib/date'
import { DashboardCharts, type ChartData, type DayTrend } from '@/components/admin/DashboardCharts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '어드민 홈 | Insight Out',
  description: 'Insight Out 운영 현황과 관리자 기능을 확인합니다.',
}

const CATEGORIES = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서'] as const
type Category = typeof CATEGORIES[number]

// ─── KPI 카드 스타일 ──────────────────────────────────────────────────────────

const KPI_CARD =
  'group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-200 hover:bg-brand-50'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const todayStart = getKstTodayStartIso()
  const todayStartMs = new Date(todayStart).getTime()
  const fourteenDaysStart = new Date(todayStartMs - 13 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysStart  = new Date(todayStartMs - 29 * 24 * 60 * 60 * 1000).toISOString()

  const [
    totalRes, todayRes, pendingRes, publishedRes, rejectedRes,
    activeSourcesRes, totalSourcesRes, bookmarkedRes, researchRes,
    newsRes, reportRes, webRes, ytRes, aiRes,
    newsTodayRes, reportTodayRes, webTodayRes, ytTodayRes, aiTodayRes,
    trendRes, sourceRes,
  ] = await Promise.all([
    // KPI head counts
    supabase.from('contents').select('*', { count: 'exact', head: true }),
    supabase.from('contents').select('*', { count: 'exact', head: true }).gte('collected_at', todayStart),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('sources').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('sources').select('*', { count: 'exact', head: true }),
    supabase.from('contents').select('*', { count: 'exact', head: true }).gt('bookmark_count', 0),
    supabase.from('ai_report_sources').select('*', { count: 'exact', head: true }).not('content_id', 'is', null),
    // 카테고리 전체 분포
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '뉴스'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '리포트'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '웹인사이트'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '유튜브'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', 'AI보고서'),
    // 카테고리 오늘 분포
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '뉴스').gte('collected_at', todayStart),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '리포트').gte('collected_at', todayStart),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '웹인사이트').gte('collected_at', todayStart),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', '유튜브').gte('collected_at', todayStart),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('category', 'AI보고서').gte('collected_at', todayStart),
    // 14일 추이 (바운디드)
    supabase.from('contents').select('category, collected_at').gte('collected_at', fourteenDaysStart),
    // 소스 Top 10 (바운디드 30일)
    supabase.from('contents').select('source_id, sources(name)').gte('collected_at', thirtyDaysStart).not('source_id', 'is', null),
  ])

  // ── 카테고리 집계 ──────────────────────────────────────────────────────────

  const catTotals: Record<Category, number> = {
    뉴스:     newsRes.count   ?? 0,
    리포트:   reportRes.count ?? 0,
    웹인사이트: webRes.count  ?? 0,
    유튜브:   ytRes.count     ?? 0,
    'AI보고서': aiRes.count   ?? 0,
  }
  const catToday: Record<Category, number> = {
    뉴스:     newsTodayRes.count   ?? 0,
    리포트:   reportTodayRes.count ?? 0,
    웹인사이트: webTodayRes.count  ?? 0,
    유튜브:   ytTodayRes.count     ?? 0,
    'AI보고서': aiTodayRes.count   ?? 0,
  }

  // ── 14일 추이 집계 ─────────────────────────────────────────────────────────

  const days = Array.from({ length: 14 }, (_, i) => {
    const kst = new Date(todayStartMs - (13 - i) * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000)
    return `${String(kst.getUTCMonth() + 1).padStart(2, '0')}/${String(kst.getUTCDate()).padStart(2, '0')}`
  })

  type TrendBucket = Omit<DayTrend, 'date'>
  const trendMap: Record<string, TrendBucket> = {}
  days.forEach(d => { trendMap[d] = { 뉴스: 0, 리포트: 0, 웹인사이트: 0, 유튜브: 0, 'AI보고서': 0 } })

  type TrendRow = { category: string; collected_at: string }
  for (const row of (trendRes.data ?? []) as TrendRow[]) {
    const kst = new Date(new Date(row.collected_at).getTime() + 9 * 60 * 60 * 1000)
    const label = `${String(kst.getUTCMonth() + 1).padStart(2, '0')}/${String(kst.getUTCDate()).padStart(2, '0')}`
    if (trendMap[label] && (CATEGORIES as readonly string[]).includes(row.category)) {
      ;(trendMap[label] as Record<string, number>)[row.category]++
    }
  }
  const dayTrend: DayTrend[] = days.map(d => ({ date: d, ...trendMap[d] }))

  // ── 소스 Top 10 집계 ───────────────────────────────────────────────────────

  type SourceRow = { source_id: string | null; sources: { name: string } | { name: string }[] | null }
  const sourceMap: Record<string, { name: string; count: number }> = {}
  for (const row of (sourceRes.data ?? []) as SourceRow[]) {
    const sid = row.source_id
    const src = row.sources
    const name = Array.isArray(src) ? src[0]?.name : (src as { name: string } | null)?.name
    if (sid && name) {
      if (!sourceMap[sid]) sourceMap[sid] = { name, count: 0 }
      sourceMap[sid].count++
    }
  }
  const sourceTop = Object.entries(sourceMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([sourceId, { name, count }]) => ({ sourceId, name, count }))

  // ── ChartData 직렬화 ───────────────────────────────────────────────────────

  const chartData: ChartData = {
    categoryDist:      CATEGORIES.map(c => ({ name: c, value: catTotals[c] })),
    todayCategoryDist: CATEGORIES.map(c => ({ name: c, value: catToday[c] })),
    statusDist: [
      { name: '게시됨',    value: publishedRes.count ?? 0 },
      { name: '검토 대기', value: pendingRes.count   ?? 0 },
      { name: '반려됨',    value: rejectedRes.count  ?? 0 },
    ],
    dayTrend,
    sourceTop,
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">어드민 홈</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          콘텐츠 수집 현황과 운영 기능을 한곳에서 관리합니다.
        </p>
      </div>

      {/* ① KPI 카드 */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="mb-3 text-sm font-semibold text-foreground">
          운영 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {/* 총 콘텐츠 */}
          <Link href="/admin/contents" className={KPI_CARD}>
            <p className="text-xs font-medium text-muted-foreground">총 콘텐츠</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(totalRes.count ?? 0).toLocaleString()}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {CATEGORIES.map(c => (
                <span key={c}>{c} {catTotals[c].toLocaleString()}</span>
              ))}
            </div>
          </Link>

          {/* 오늘 수집 */}
          <Link href="/admin/contents?from=today" className={KPI_CARD}>
            <p className="text-xs font-medium text-muted-foreground">오늘 수집</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(todayRes.count ?? 0).toLocaleString()}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {CATEGORIES.map(c => (
                <span key={c}>{c} {catToday[c].toLocaleString()}</span>
              ))}
            </div>
          </Link>

          {/* 검토 대기 */}
          <Link href="/admin/contents?status=pending" className={KPI_CARD}>
            <p className="text-xs font-medium text-muted-foreground">검토 대기</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(pendingRes.count ?? 0).toLocaleString()}
            </p>
          </Link>

          {/* 북마크된 콘텐츠 */}
          <Link href="/admin/contents?bookmarked=1" className={KPI_CARD}>
            <p className="text-xs font-medium text-muted-foreground">북마크된 콘텐츠</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(bookmarkedRes.count ?? 0).toLocaleString()}
            </p>
          </Link>

          {/* 활성 소스 */}
          <Link href="/admin/sources" className={KPI_CARD}>
            <p className="text-xs font-medium text-muted-foreground">활성 소스</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {(activeSourcesRes.count ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              전체 {(totalSourcesRes.count ?? 0).toLocaleString()}개
            </p>
          </Link>

          {/* 리서치 반영 (AI 보고서 뷰 미구현 — 준비중) */}
          <div className={KPI_CARD + ' cursor-default opacity-60'}>
            <p className="text-xs font-medium text-muted-foreground">리서치 반영</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {researchRes.count ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">AI 보고서 인용 콘텐츠 · 준비중</p>
          </div>
        </div>
      </section>

      {/* ② 차트 */}
      <section aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="mb-3 text-sm font-semibold text-foreground">
          수집 분석
        </h2>
        <DashboardCharts chartData={chartData} />
      </section>

    </div>
  )
}
