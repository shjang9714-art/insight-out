import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getKstTodayStartIso } from '@/lib/date'
import { DashboardCharts, type ChartData, type DayTrend } from '@/components/admin/DashboardCharts'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import { LLM_PROVIDERS } from '@/lib/llm'
import AdminTodoBlock from '@/components/admin/AdminTodoBlock'
import AdminOpsSignals, { type LlmProviderUsage, type OpsSignalCounts } from '@/components/admin/AdminOpsSignals'
import AdminContentHealth, { type ContentHealth } from '@/components/admin/AdminContentHealth'
import AiRefreshButton from '@/components/admin/AiRefreshButton'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '대시보드 | Insight Out',
  description: 'Insight Out 운영 현황과 관리자 기능을 확인합니다.',
}

const CATEGORIES = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서'] as const
type Category = typeof CATEGORIES[number]

// ─── KPI 카드 스타일 ──────────────────────────────────────────────────────────

const KPI_CARD =
  'group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-accent'

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
  const yesterday = new Date(todayStartMs - 24 * 60 * 60 * 1000).toISOString()
  const period = getKstPeriod()

  // admin 클라이언트 — usage/신호등 집계(graceful)
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { /* env 미설정 시 무시 */ }

  const [
    totalRes, todayRes, pendingRes, publishedRes, rejectedRes,
    activeSourcesRes, totalSourcesRes, bookmarkedRes, researchRes,
    newsRes, reportRes, webRes, ytRes, aiRes,
    newsTodayRes, reportTodayRes, webTodayRes, ytTodayRes, aiTodayRes,
    trendRes, sourceRes,
    // 신규 — 오늘 할 일
    crawlFailedRes, crawlSourcesRes, pendingUsersRes,
    // 신규 — 전체 사용자 수 KPI (278)
    totalUsersRes,
    // 신규 — usage
    llmUsageRes, llmSettingsRes, transUsageRes, ttsUsageRes,
    // 신규 — 데이터 점등
    issuesCountRes, entitiesCountRes, insightCardsCountRes, aiReportsCountRes, contentSignalsRes,
    // 콘텐츠 건강
    bodyFullRes, bodySnippetRes, bodyNoneRes, sentMissingRes, untaggedRes, brokenLinkRes, deadLinksRes,
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
    // 오늘 크롤 실패 건수
    supabase.from('crawl_logs').select('*', { count: 'exact', head: true }).in('status', ['failed', 'partial']).gte('started_at', todayStart),
    // 최근 24h 실패 소스 목록 (distinct source_id 집계용)
    supabase.from('crawl_logs').select('source_id').in('status', ['failed', 'partial']).gte('started_at', yesterday).not('source_id', 'is', null),
    // 승인 대기 사용자 수 (193, approval_status 컬럼 없으면 error → graceful 생략)
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    // 전체 사용자 수 (278)
    supabase.from('users').select('*', { count: 'exact', head: true }),
    // LLM usage
    admin ? admin.from('llm_usage').select('provider, tokens').eq('period', period) : Promise.resolve({ data: [], error: null }),
    admin ? admin.from('llm_settings').select('provider, enabled, monthly_token_limit') : Promise.resolve({ data: [], error: null }),
    // 번역 usage
    admin ? admin.from('translation_usage').select('chars').eq('period', period) : Promise.resolve({ data: [], error: null }),
    // TTS usage
    admin ? admin.from('tts_usage').select('chars').eq('period', period) : Promise.resolve({ data: [], error: null }),
    // 데이터 점등
    supabase.from('issues').select('*', { count: 'exact', head: true }),
    supabase.from('entities').select('*', { count: 'exact', head: true }),
    supabase.from('insight_cards').select('*', { count: 'exact', head: true }),
    supabase.from('ai_reports').select('*', { count: 'exact', head: true }),
    // content_signals — graceful(테이블 없으면 0)
    supabase.from('content_signals').select('*', { count: 'exact', head: true }).limit(0),
    // 콘텐츠 건강 집계 (8개)
    supabase.from('contents').select('*', { count: 'exact', head: true }).not('body_fetched_at', 'is', null).gte('body_len', 400),
    supabase.from('contents').select('*', { count: 'exact', head: true }).not('body_fetched_at', 'is', null).lt('body_len', 400),
    supabase.from('contents').select('*', { count: 'exact', head: true }).is('body_fetched_at', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').is('sentiment', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).is('matched_groups', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').ilike('original_url', '%news.google.com%'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('link_ok', false),
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

  // ── 오늘 할 일 집계 ────────────────────────────────────────────────────────
  const todayFailed   = crawlFailedRes.count ?? 0
  type CrawlSrcRow = { source_id: string }
  const failedSrcIds  = new Set((crawlSourcesRes.data ?? []).map((r: CrawlSrcRow) => r.source_id))
  const sourcesToCheck = failedSrcIds.size
  const pendingUsers   = pendingUsersRes.error ? null : (pendingUsersRes.count ?? 0)

  // ── LLM 사용량 집계 ────────────────────────────────────────────────────────
  const usageMap = new Map<string, number>(
    ((llmUsageRes.data ?? []) as { provider: string; tokens: number }[]).map(r => [r.provider, r.tokens ?? 0])
  )
  const settingsMap = new Map<string, { enabled: boolean; monthly_token_limit: number }>(
    ((llmSettingsRes.data ?? []) as { provider: string; enabled: boolean; monthly_token_limit: number }[]).map(r => [r.provider, r])
  )
  const llmProviders: LlmProviderUsage[] = LLM_PROVIDERS.map(p => {
    const s = settingsMap.get(p.name)
    return {
      name:        p.name,
      configured:  p.isConfigured(),
      enabled:     s?.enabled ?? true,
      tokensUsed:  usageMap.get(p.name) ?? 0,
      tokenLimit:  s?.monthly_token_limit ?? 1_000_000,
    }
  })

  const translationChars = ((transUsageRes.data ?? []) as { chars: number }[]).reduce((sum, r) => sum + (r.chars ?? 0), 0)
  const ttsChars         = ((ttsUsageRes.data ?? []) as { chars: number }[]).reduce((sum, r) => sum + (r.chars ?? 0), 0)
  const ttsMonthlyCap    = process.env.TTS_MONTHLY_CHAR_CAP ? Number(process.env.TTS_MONTHLY_CHAR_CAP) : null

  // ── 데이터 점등 집계 ────────────────────────────────────────────────────────
  const signalCounts: OpsSignalCounts = {
    issues:        issuesCountRes.count      ?? 0,
    entities:      entitiesCountRes.count    ?? 0,
    insightCards:  insightCardsCountRes.count ?? 0,
    aiReports:     aiReportsCountRes.count   ?? 0,
    contentSignals: contentSignalsRes.count  ?? 0,
  }

  // ── 콘텐츠 건강 집계 ──────────────────────────────────────────────────────
  const contentHealth: ContentHealth = {
    total:             totalRes.count     ?? 0,
    published:         publishedRes.count ?? 0,
    bodyFull:          bodyFullRes.count  ?? 0,
    bodySnippet:       bodySnippetRes.count ?? 0,
    bodyNone:          bodyNoneRes.count  ?? 0,
    bodyLenAvailable:  !bodyFullRes.error,
    sentimentMissing:  sentMissingRes.count ?? 0,
    untagged:          untaggedRes.count  ?? 0,
    brokenLinks:       brokenLinkRes.count ?? 0,
    deadLinks:         deadLinksRes.error ? 0 : (deadLinksRes.count ?? 0),
  }

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
      <AdminPageHeader />

      {/* ① 오늘 할 일 */}
      <AdminTodoBlock
        pending={pendingRes.count ?? 0}
        todayFailed={todayFailed}
        sourcesToCheck={sourcesToCheck}
        pendingUsers={pendingUsers}
      />

      {/* ② AI 수동 갱신 */}
      <AiRefreshButton />

      {/* ④ 운영 신호등 */}
      <AdminOpsSignals
        llmProviders={llmProviders}
        translationChars={translationChars}
        ttsChars={ttsChars}
        ttsMonthlyCap={ttsMonthlyCap}
        signalCounts={signalCounts}
      />

      {/* ⑤ 콘텐츠 건강 */}
      <AdminContentHealth health={contentHealth} />

      {/* ③ KPI 카드 */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="admin-section-title mb-4 text-foreground">
          운영 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {/* 총 콘텐츠 */}
          <Link href="/admin/contents" className={KPI_CARD}>
            <p className="admin-card-title text-muted-foreground">총 콘텐츠</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(totalRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">수집·저장된 전체 콘텐츠</p>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 admin-caption text-muted-foreground">
              {CATEGORIES.map(c => (
                <span key={c}>{c} {catTotals[c].toLocaleString()}</span>
              ))}
            </div>
          </Link>

          {/* 오늘 수집 */}
          <Link href="/admin/contents?from=today" className={KPI_CARD}>
            <p className="admin-card-title text-muted-foreground">오늘 수집</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(todayRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">오늘 새로 들어온 콘텐츠</p>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 admin-caption text-muted-foreground">
              {CATEGORIES.map(c => (
                <span key={c}>{c} {catToday[c].toLocaleString()}</span>
              ))}
            </div>
          </Link>

          {/* 북마크된 콘텐츠 */}
          <Link href="/admin/contents?bookmarked=1" className={KPI_CARD}>
            <p className="admin-card-title text-muted-foreground">북마크된 콘텐츠</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(bookmarkedRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">사용자가 저장한 콘텐츠</p>
          </Link>

          {/* 전체 사용자 수 (278) */}
          <Link href="/admin/users" className={KPI_CARD}>
            <p className="admin-card-title text-muted-foreground">전체 사용자</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(totalUsersRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">명</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">가입된 전체 사용자</p>
          </Link>

          {/* 활성 소스 */}
          <Link href="/admin/sources" className={KPI_CARD}>
            <p className="admin-card-title text-muted-foreground">활성 소스</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(activeSourcesRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">곳</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">수집 중인 소스</p>
            <p className="mt-1 admin-caption text-muted-foreground">
              전체 {(totalSourcesRes.count ?? 0).toLocaleString()}개
            </p>
          </Link>

          {/* 리서치 반영 (AI 보고서 뷰 미구현 — 준비중) */}
          <div className={KPI_CARD + ' cursor-default opacity-60'}>
            <p className="admin-card-title text-muted-foreground">리서치 반영</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{researchRes.count ?? 0}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">AI 보고서 인용 콘텐츠 · 준비중</p>
          </div>
        </div>
      </section>

      {/* ② 차트 */}
      <section aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="admin-section-title mb-4 text-foreground">
          수집 분석
        </h2>
        <DashboardCharts chartData={chartData} />
      </section>

    </div>
  )
}
