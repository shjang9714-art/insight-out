import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Database, Users } from 'lucide-react'
import { getKstTodayStartIso } from '@/lib/date'
import { type ChartData, type DayTrend } from '@/components/admin/DashboardCharts'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstPeriod } from '@/lib/translate'
import { LLM_PROVIDERS } from '@/lib/llm'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import AdminTodoBlock from '@/components/admin/AdminTodoBlock'
import AdminOpsSignals, { type LlmProviderUsage } from '@/components/admin/AdminOpsSignals'
import AdminContentHealth, { type ContentHealth } from '@/components/admin/AdminContentHealth'
import AiRefreshButton from '@/components/admin/AiRefreshButton'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminFailedJobsCard, { type FailedJobRow } from '@/components/admin/AdminFailedJobsCard'
import { AdminCollectionAnalysisDialog } from '@/components/admin/AdminCollectionAnalysisDialog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '대시보드 | Insight Out',
  description: 'Insight Out 운영 대시보드와 관리자 기능을 확인합니다.',
}

const CATEGORIES = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서'] as const
type Category = typeof CATEGORIES[number]

// ─── KPI 카드 스타일 ──────────────────────────────────────────────────────────

const KPI_PANEL =
  'flex h-full flex-col rounded-2xl border border-border bg-card p-5'

const KPI_LINK =
  'group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-accent'

const CATEGORY_LINK =
  'rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:bg-accent'

function CategoryBreakdown({ values, todayOnly = false }: { values: Record<Category, number>; todayOnly?: boolean }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {CATEGORIES.map((category) => (
        <Link
          key={category}
          href={`/admin/contents?category=${encodeURIComponent(category)}${todayOnly ? '&from=today' : ''}`}
          className={CATEGORY_LINK}
        >
          <span className="block admin-caption text-muted-foreground">{category}</span>
          <span className="mt-1 block text-sm font-semibold tabular-nums text-foreground">
            {values[category].toLocaleString()}
          </span>
        </Link>
      ))}
    </div>
  )
}

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

  // admin 클라이언트 — usage 집계(graceful)
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
    llmUsageRes, llmSettingsRes, llmRoutingRes, transUsageRes, ttsUsageRes,
    // 콘텐츠 건강
    bodyFullRes, bodySnippetRes, bodyNoneRes, sentMissingRes, untaggedRes, brokenLinkRes, deadLinksRes,
    // 신규 — 최근 실패한 작업(289)
    failedJobsRes,
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
    admin ? admin.from('llm_task_routing').select('provider, task_type').eq('is_active', true) : Promise.resolve({ data: [], error: null }),
    // 번역 usage
    admin ? admin.from('translation_usage').select('chars').eq('period', period) : Promise.resolve({ data: [], error: null }),
    // TTS usage
    admin ? admin.from('tts_usage').select('chars').eq('period', period) : Promise.resolve({ data: [], error: null }),
    // 콘텐츠 건강 집계 (8개)
    supabase.from('contents').select('*', { count: 'exact', head: true }).not('body_fetched_at', 'is', null).gte('body_len', 400),
    supabase.from('contents').select('*', { count: 'exact', head: true }).not('body_fetched_at', 'is', null).lt('body_len', 400),
    supabase.from('contents').select('*', { count: 'exact', head: true }).is('body_fetched_at', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').is('sentiment', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).is('matched_groups', null),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').ilike('original_url', '%news.google.com%'),
    supabase.from('contents').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('link_ok', false),
    // 최근 24시간 내 실패한 작업(job_runs, 289) — 테이블 미적용(42P01) 시 error → 카드 숨김(graceful)
    admin
      ? admin.from('job_runs').select('id, job_key, error, started_at').eq('status', 'failed').gte('started_at', yesterday).order('started_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
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
  const providerTaskMap = new Map<string, Set<string>>()
  for (const row of (llmRoutingRes.data ?? []) as { provider: string; task_type: string }[]) {
    const tasks = providerTaskMap.get(row.provider) ?? new Set<string>()
    tasks.add(row.task_type)
    providerTaskMap.set(row.provider, tasks)
  }
  const providerTasks = Object.fromEntries(
    [...providerTaskMap].map(([provider, tasks]) => [provider, [...tasks]])
  )
  const llmProviders: LlmProviderUsage[] = LLM_PROVIDERS.map(p => {
    const s = settingsMap.get(p.name)
    const keyCount = getProviderKeyCount(p)
    return {
      name:        p.name,
      configured:  p.isConfigured(),
      enabled:     s?.enabled ?? true,
      keyCount,
      tokensUsed:  usageMap.get(p.name) ?? 0,
      tokenLimit:  (s?.monthly_token_limit ?? 1_000_000) * keyCount,
    }
  })

  const translationChars = ((transUsageRes.data ?? []) as { chars: number }[]).reduce((sum, r) => sum + (r.chars ?? 0), 0)
  const ttsChars         = ((ttsUsageRes.data ?? []) as { chars: number }[]).reduce((sum, r) => sum + (r.chars ?? 0), 0)
  const ttsMonthlyCap    = process.env.TTS_MONTHLY_CHAR_CAP ? Number(process.env.TTS_MONTHLY_CHAR_CAP) : null

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

  // ── 최근 실패한 작업(job_runs, 289) — 42P01(테이블 미적용) 시 카드 숨김 ──────
  const jobRunsReady = !failedJobsRes.error
  const failedJobs: FailedJobRow[] = jobRunsReady ? ((failedJobsRes.data ?? []) as FailedJobRow[]) : []

  // ── ChartData 직렬화 ───────────────────────────────────────────────────────

  const chartData: ChartData = {
    categoryDist:      CATEGORIES.map(c => ({ name: c, value: catTotals[c] })),
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
      <AdminPageHeader actions={<AiRefreshButton />} />

      {/* ① 최근 실패한 작업(289) — 크론 10개 계측. 있으면 눈에 띄게, 없으면 조용히 */}
      <AdminFailedJobsCard jobs={failedJobs} ready={jobRunsReady} />

      {/* ② 오늘 할 일 */}
      <AdminTodoBlock
        pending={pendingRes.count ?? 0}
        todayFailed={todayFailed}
        sourcesToCheck={sourcesToCheck}
        pendingUsers={pendingUsers}
      />

      {/* ③ 사용량 및 수집 관리 */}
      <AdminOpsSignals
        llmProviders={llmProviders}
        period={period}
        providerTasks={providerTasks}
        translationChars={translationChars}
        ttsChars={ttsChars}
        ttsMonthlyCap={ttsMonthlyCap}
      />
      <AdminContentHealth health={contentHealth} />

      {/* ④ 콘텐츠 수집현황 */}
      <section aria-label="콘텐츠 수집현황">
        <AdminSectionHeader
          icon={Database}
          title="콘텐츠 수집현황"
          hint="카테고리별 수집량과 운영 KPI"
          action={<AdminCollectionAnalysisDialog chartData={chartData} />}
        />
        <div className="grid gap-3 xl:grid-cols-2">
          {/* 총 콘텐츠 */}
          <div className={KPI_PANEL}>
            <p className="admin-card-title text-muted-foreground">총 콘텐츠</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(totalRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">수집·저장된 전체 콘텐츠</p>
            <Link href="/admin/contents" className="mt-2 w-fit admin-caption font-medium text-muted-foreground hover:text-foreground hover:underline">
              전체 보기
            </Link>
            <CategoryBreakdown values={catTotals} />
          </div>

          {/* 오늘 수집 */}
          <div className={KPI_PANEL}>
            <p className="admin-card-title text-muted-foreground">오늘 수집</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(todayRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">오늘 새로 들어온 콘텐츠</p>
            <Link href="/admin/contents?from=today" className="mt-2 w-fit admin-caption font-medium text-muted-foreground hover:text-foreground hover:underline">
              오늘 전체 보기
            </Link>
            <CategoryBreakdown values={catToday} todayOnly />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* 북마크된 콘텐츠 */}
          <Link href="/admin/contents?bookmarked=1" className={KPI_LINK}>
            <p className="admin-card-title text-muted-foreground">북마크된 콘텐츠</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(bookmarkedRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">사용자가 저장한 콘텐츠</p>
          </Link>

          {/* 활성 소스 */}
          <Link href="/admin/sources" className={KPI_LINK}>
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
          <div className={KPI_PANEL + ' cursor-default opacity-60'}>
            <p className="admin-card-title text-muted-foreground">리서치 반영</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{researchRes.count ?? 0}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">건</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">AI 보고서 인용 콘텐츠 · 준비중</p>
          </div>
        </div>
      </section>

      {/* ⑤ 사용자 현황 */}
      <section aria-label="사용자 현황">
        <AdminSectionHeader icon={Users} title="사용자 현황" hint="가입 계정 기준" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/users" className={KPI_LINK}>
            <p className="admin-card-title text-muted-foreground">전체 사용자</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="admin-metric-dashboard text-foreground">{(totalUsersRes.count ?? 0).toLocaleString()}</span>
              <span className="admin-metric-unit-dashboard text-muted-foreground">명</span>
            </p>
            <p className="mt-1 admin-caption text-muted-foreground">가입된 전체 사용자</p>
          </Link>
        </div>
      </section>

    </div>
  )
}
