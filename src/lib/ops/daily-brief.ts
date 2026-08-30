import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateCronStatus, EXPECTED_CRONS } from '@/lib/jobs/expected-crons'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  monthlyBudget,
} from '@/lib/llm/token-limit'
import { getOpsSettings } from '@/lib/ops/settings'

export type BriefSeverity = 'critical' | 'warning' | 'notice'
export type DataStatus = 'normal' | 'warning' | 'critical' | 'unavailable'

export interface BriefAlert {
  severity: BriefSeverity
  message: string
}

export interface BriefIssue {
  title: string
  severity: BriefSeverity
  occurrence_count: number
  first_seen_at: string | null
  last_seen_at: string | null
  recommended_action: string | null
  suspected_cause: string | null
  fingerprint: string
}

export interface DataPoint<T> {
  available: boolean
  value: T
}

export interface DailyValue {
  date: string
  value: number
}

export interface TrendMetric extends DataPoint<number> {
  previous: number | null
  average7: number | null
  previousDeltaPct: number | null
  average7DeltaPct: number | null
  history: DailyValue[]
}

export interface CronStatus {
  key: string
  label: string
  tone: 'ok' | 'stale' | 'missing' | 'failing'
  lastAt: string | null
  lastSuccessAt: string | null
  maxAgeHours: number
}

export interface SourceCollectionSummary {
  total: number
  categories: { category: string; count: number; share: number }[]
  topSources: { name: string; category: string; count: number; share: number }[]
  unspecified: { count: number; share: number }
}

export interface DailyBrief {
  date: string
  period: {
    date: string
    startIso: string
    endIso: string
    rangeLabel: string
    generatedLabel: string
  }
  severity: 'normal' | 'warning' | 'critical'
  alerts: BriefAlert[]
  issues: BriefIssue[]
  system: {
    crawlFailed: DataPoint<number>
    crawlPartial: DataPoint<number>
    backlog: DataPoint<number>
    failedJobs: DataPoint<number>
    /** 492 — 휴지통 30일 초과분 자동 정리 결과. gatherDailyBrief 는 채우지 않는다(순수 조회 함수) —
     *  ops-brief 크론이 cleanupExpiredTrash 실행 후 이 필드를 직접 채워 넣는다. */
    trashCleanup?: DataPoint<{ deleted: number; capped: boolean }>
  }
  collection: {
    collected: TrendMetric
    published: TrendMetric
    rejected: DataPoint<number>
    pending: DataPoint<number>
    sourceBreakdown: DataPoint<SourceCollectionSummary>
    activeSources: DataPoint<number>
    reviewReasons: DataPoint<{ reason: string; label: string; count: number }[]>
  }
  publication: {
    total: TrendMetric
    aiReports: DataPoint<{ published: number; failed: number }>
    briefings: DataPoint<{ published: number; failed: number; errors: string[] }>
    competitorWeekly: DataPoint<{ status: string; count: number }[]>
    dailyInsights: DataPoint<{ total: number; needsReview: number }>
    newsletter: DataPoint<{ total: number; sent: number; delivered: number; opened: number; failed: number; bounced: number; successRate: number }>
  }
  crons: DataPoint<CronStatus[]>
  usage: {
    llm: DataPoint<{ provider: string; used: number; limit: number; percent: number }[]>
    translation: DataPoint<{ used: number; limit: number; percent: number }>
    tts: DataPoint<{ used: number; limit: number; percent: number }>
  }
  users: {
    total: DataPoint<number>
    newUsers: TrendMetric
    pending: DataPoint<number>
    inactive7d: DataPoint<number>
  }
}

export interface DailyBriefOptions {
  /** 어드민 프리뷰에서 부분 실패 렌더를 검증할 때만 사용한다. */
  forceUnavailableSection?: 'usage' | 'sources'
}

interface CountResponse {
  count: number | null
  error: { message: string } | null
}

interface DataResponse<T> {
  data: T[] | null
  error: { message: string } | null
}

interface KstDay {
  date: string
  startIso: string
  endIso: string
}

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const REVIEW_REASONS = [
  ['body_missing', '본문 없음'],
  ['body_short', '본문 짧음'],
  ['body_truncated', '본문 잘림'],
  ['extract_failed', '본문 추출 실패'],
  ['low_relevance', '관련도 낮음'],
  ['llm_irrelevant', 'AI 관련 없음 판정'],
  ['excluded_rule', '제외 규칙'],
] as const

/** 502 — 리포트가 전용 알림으로 이미 같은 수치를 보고하는 지표. 두 줄로 중복되고
 *  측정 시점 차이로 숫자까지 달라져 혼란을 준다. 감지 자체는 유지(어드민 화면용). */
const REPORT_DUPLICATE_ISSUE_FINGERPRINTS = new Set(['enrichment:backlog'])

function toDateKey(utcMidnightMs: number): string {
  return new Date(utcMidnightMs).toISOString().slice(0, 10)
}

function kstDayFromDateKey(date: string): KstDay {
  const [year, month, day] = date.split('-').map(Number)
  const startMs = Date.UTC(year, month - 1, day) - KST_OFFSET_MS
  return {
    date,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + DAY_MS).toISOString(),
  }
}

function getReportDays(now = new Date()): { report: KstDay; history: KstDay[] } {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const todayKstMidnight = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate()
  )
  const reportMidnight = todayKstMidnight - DAY_MS
  const history = Array.from({ length: 14 }, (_, index) =>
    kstDayFromDateKey(toDateKey(reportMidnight - (13 - index) * DAY_MS))
  )
  return { report: history[history.length - 1], history }
}

function formatKstDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const year = kst.getUTCFullYear()
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hour = String(kst.getUTCHours()).padStart(2, '0')
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${year}.${month}.${day} ${hour}:${minute}`
}

function periodLabel(report: KstDay): string {
  const start = formatKstDateTime(report.startIso)
  const inclusiveEnd = formatKstDateTime(new Date(new Date(report.endIso).getTime() - 1).toISOString())
  return `${start}~${inclusiveEnd} KST`
}

function monthAt(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function pct(used: number, limit: number): number {
  return limit > 0 ? Math.round(used / limit * 100) : 0
}

function deltaPct(current: number, baseline: number | null): number | null {
  if (baseline === null || baseline === 0) return null
  return Math.round((current - baseline) / baseline * 100)
}

function unavailableMetric(): TrendMetric {
  return {
    available: false,
    value: 0,
    previous: null,
    average7: null,
    previousDeltaPct: null,
    average7DeltaPct: null,
    history: [],
  }
}

function buildTrendMetric(days: KstDay[], points: DataPoint<number>[]): TrendMetric {
  if (points.some(point => !point.available)) return unavailableMetric()
  const history = days.map((day, index) => ({ date: day.date, value: points[index].value }))
  const current = history[history.length - 1]?.value ?? 0
  const previous = history[history.length - 2]?.value ?? null
  const averageWindow = history.slice(-8, -1)
  const average7 = averageWindow.length
    ? Math.round(averageWindow.reduce((sum, point) => sum + point.value, 0) / averageWindow.length)
    : null
  return {
    available: true,
    value: current,
    previous,
    average7,
    previousDeltaPct: deltaPct(current, previous),
    average7DeltaPct: deltaPct(current, average7),
    history,
  }
}

async function safeCount(
  label: string,
  query: PromiseLike<CountResponse>
): Promise<DataPoint<number>> {
  try {
    const result = await query
    if (result.error) {
      console.error(`[운영리포트] ${label} 조회 실패:`, result.error.message)
      return { available: false, value: 0 }
    }
    return { available: true, value: result.count ?? 0 }
  } catch (error) {
    console.error(`[운영리포트] ${label} 조회 오류:`, error)
    return { available: false, value: 0 }
  }
}

async function safeData<T>(
  label: string,
  query: PromiseLike<DataResponse<T>>
): Promise<DataPoint<T[]>> {
  try {
    const result = await query
    if (result.error) {
      console.error(`[운영리포트] ${label} 조회 실패:`, result.error.message)
      return { available: false, value: [] }
    }
    return { available: true, value: result.data ?? [] }
  } catch (error) {
    console.error(`[운영리포트] ${label} 조회 오류:`, error)
    return { available: false, value: [] }
  }
}

async function gatherTimestampTrend(
  admin: SupabaseClient,
  days: KstDay[],
  table: string,
  column: string,
  label: string,
  status?: { column: string; value: string }
): Promise<TrendMetric> {
  const points = await Promise.all(days.map((day) => {
    let query = admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .gte(column, day.startIso)
      .lt(column, day.endIso)
    if (status) query = query.eq(status.column, status.value)
    return safeCount(`${label} ${day.date}`, query)
  }))
  return buildTrendMetric(days, points)
}

async function gatherDateTrend(
  admin: SupabaseClient,
  days: KstDay[],
  table: string,
  column: string,
  label: string,
  status?: { column: string; value: string }
): Promise<TrendMetric> {
  const points = await Promise.all(days.map((day) => {
    let query = admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, day.date)
    if (status) query = query.eq(status.column, status.value)
    return safeCount(`${label} ${day.date}`, query)
  }))
  return buildTrendMetric(days, points)
}

function sumTrendMetrics(days: KstDay[], metrics: TrendMetric[]): TrendMetric {
  if (metrics.some(metric => !metric.available)) return unavailableMetric()
  const points = days.map((day, index) => ({
    available: true,
    value: metrics.reduce((sum, metric) => sum + (metric.history[index]?.value ?? 0), 0),
  }))
  return buildTrendMetric(days, points)
}

async function gatherCronStatuses(
  admin: SupabaseClient,
  now: Date
): Promise<DataPoint<CronStatus[]>> {
  const rows = await Promise.all(EXPECTED_CRONS.map(async (cron) => {
    const [lastRunResult, lastSuccessResult] = await Promise.all([
      safeData<{ started_at: string; status: string }>(
        `cron ${cron.key} 마지막 실행`,
        admin
          .from('job_runs')
          .select('started_at, status')
          .eq('job_key', cron.key)
          .order('started_at', { ascending: false })
          .limit(1)
      ),
      safeData<{ started_at: string; status: string }>(
        `cron ${cron.key} 마지막 성공`,
        admin
          .from('job_runs')
          .select('started_at, status')
          .eq('job_key', cron.key)
          .in('status', ['succeeded', 'skipped'])
          .order('started_at', { ascending: false })
          .limit(1)
      ),
    ])
    if (!lastRunResult.available || !lastSuccessResult.available) return { available: false as const, status: null }
    const lastAt = lastRunResult.value[0]?.started_at ?? null
    const lastSuccessAt = lastSuccessResult.value[0]?.started_at ?? null
    const { tone } = evaluateCronStatus(cron, lastAt, lastSuccessAt, now.getTime())
    return {
      available: true as const,
      status: {
        key: cron.key,
        label: cron.label,
        tone,
        lastAt,
        lastSuccessAt,
        maxAgeHours: cron.maxAgeHours,
      },
    }
  }))
  if (rows.some(row => !row.available || !row.status)) {
    return { available: false, value: [] }
  }
  return { available: true, value: rows.flatMap(row => row.status ? [row.status] : []) }
}

async function gatherSourceCollection(
  admin: SupabaseClient,
  report: KstDay,
  forceFailure: boolean
): Promise<DataPoint<SourceCollectionSummary>> {
  if (forceFailure) {
    await safeData('소스별 수집 현황 강제 실패', admin.from('__ops_brief_forced_failure').select('id'))
    return {
      available: false,
      value: { total: 0, categories: [], topSources: [], unspecified: { count: 0, share: 0 } },
    }
  }

  type SourceRow = {
    id: string
    category: string | null
    source_id: string | null
    sources: { name: string; type: string | null } | { name: string; type: string | null }[] | null
  }
  const rows: SourceRow[] = []
  const pageSize = 1_000
  for (let from = 0; ; from += pageSize) {
    const result = await safeData<SourceRow>(
      `소스별 수집 현황 ${from + 1}~${from + pageSize}`,
      admin
        .from('contents')
        .select('id, category, source_id, sources(name, type)')
        .gte('collected_at', report.startIso)
        .lt('collected_at', report.endIso)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + pageSize - 1)
    )
    if (!result.available) {
      return {
        available: false,
        value: { total: 0, categories: [], topSources: [], unspecified: { count: 0, share: 0 } },
      }
    }
    rows.push(...result.value)
    if (result.value.length < pageSize) break
  }

  const total = rows.length
  const share = (count: number) => total ? Math.round(count / total * 100) : 0
  const categories = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서'].map(category => {
    const count = rows.filter(row => row.category === category).length
    return { category, count, share: share(count) }
  })
  const sourceMap = new Map<string, {
    name: string
    count: number
    categories: Map<string, number>
  }>()
  for (const row of rows) {
    if (!row.source_id) continue
    const relation = Array.isArray(row.sources) ? row.sources[0] : row.sources
    const current = sourceMap.get(row.source_id) ?? {
      name: relation?.name ?? '이름 없음',
      count: 0,
      categories: new Map<string, number>(),
    }
    current.count++
    const category = row.category ?? relation?.type ?? '기타'
    current.categories.set(category, (current.categories.get(category) ?? 0) + 1)
    sourceMap.set(row.source_id, current)
  }
  const topSources = [...sourceMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(source => ({
      name: source.name,
      category: [...source.categories].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타',
      count: source.count,
      share: share(source.count),
    }))
  const unspecifiedCount = rows.filter(row => !row.source_id).length

  return {
    available: true,
    value: {
      total,
      categories,
      topSources,
      unspecified: { count: unspecifiedCount, share: share(unspecifiedCount) },
    },
  }
}

function statusDistribution(rows: { status: string }[]): DailyBrief['publication']['newsletter']['value'] {
  const count = (status: string) => rows.filter(row => row.status === status).length
  const sent = count('sent')
  const delivered = count('delivered')
  const opened = count('opened')
  const failed = count('failed')
  const bounced = count('bounced')
  const total = rows.length
  const success = sent + delivered + opened
  return {
    total,
    sent,
    delivered,
    opened,
    failed,
    bounced,
    successRate: total ? Math.round(success / total * 100) : 0,
  }
}

function addAvailabilityAlert(alerts: BriefAlert[], available: boolean, label: string): void {
  if (!available) {
    alerts.push({ severity: 'warning', message: `${label} 데이터를 불러오지 못했습니다.` })
  }
}

export async function gatherDailyBrief(
  admin: SupabaseClient,
  now = new Date(),
  options: DailyBriefOptions = {}
): Promise<DailyBrief> {
  const { report, history } = getReportDays(now)
  const period = monthAt(report.endIso)
  const weekDay = new Date(`${report.date}T00:00:00Z`).getUTCDay()
  const weekStartDate = toDateKey(Date.parse(`${report.date}T00:00:00Z`) - ((weekDay + 6) % 7) * DAY_MS)

  const [
    collected,
    published,
    newUsers,
    aiReportTrend,
    briefingTrend,
    insightTrend,
    crawlFailed,
    crawlPartial,
    backlog,
    rejected,
    pending,
    activeSources,
    failedJobs,
    totalUsers,
    pendingUsers,
    inactiveUsers,
    sourceBreakdown,
    aiReportsPublished,
    aiReportsFailed,
    briefingRows,
    competitorRows,
    insightTotal,
    insightReview,
    newsletterRows,
    crons,
    llmRows,
    settingsRows,
    translationRows,
    ttsRows,
    issuesResult,
  ] = await Promise.all([
    gatherTimestampTrend(admin, history, 'contents', 'collected_at', '수집'),
    gatherTimestampTrend(admin, history, 'contents', 'collected_at', '게시', { column: 'status', value: 'published' }),
    gatherTimestampTrend(admin, history, 'users', 'created_at', '신규 가입'),
    gatherTimestampTrend(admin, history, 'ai_reports', 'published_at', 'AI 리포트 발행'),
    gatherDateTrend(admin, history, 'briefings', 'briefing_date', '브리핑 발행', { column: 'status', value: 'published' }),
    gatherDateTrend(admin, history, 'daily_insights', 'day_of', '일일 핵심 발행'),
    safeCount('수집 실패', admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', report.startIso).lt('started_at', report.endIso).eq('status', 'failed')),
    safeCount('수집 부분 실패', admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', report.startIso).lt('started_at', report.endIso).eq('status', 'partial')),
    safeCount('본문 보강 대기', admin.from('contents').select('id', { count: 'exact', head: true }).is('body_fetched_at', null).not('original_url', 'is', null).is('deleted_at', null)),
    safeCount('거절 콘텐츠', admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', report.startIso).lt('collected_at', report.endIso).eq('status', 'rejected').is('deleted_at', null)),
    safeCount('검토 대기', admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null)),
    safeCount('활성 소스', admin.from('sources').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    safeCount('실패 작업', admin.from('job_runs').select('id', { count: 'exact', head: true }).gte('started_at', report.startIso).lt('started_at', report.endIso).eq('status', 'failed')),
    safeCount('전체 사용자', admin.from('users').select('id', { count: 'exact', head: true })),
    safeCount('승인 대기 사용자', admin.from('users').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending')),
    safeCount('7일 미접속 사용자', admin.from('users').select('id', { count: 'exact', head: true }).lt('last_seen_at', new Date(now.getTime() - 7 * DAY_MS).toISOString())),
    gatherSourceCollection(admin, report, options.forceUnavailableSection === 'sources'),
    safeCount('AI 리포트 발행', admin.from('ai_reports').select('id', { count: 'exact', head: true }).gte('published_at', report.startIso).lt('published_at', report.endIso)),
    safeCount('AI 리포트 실패', admin.from('ai_reports').select('id', { count: 'exact', head: true }).gte('created_at', report.startIso).lt('created_at', report.endIso).eq('status', 'failed')),
    safeData<{ status: string; error_reason: string | null }>('모닝브리핑', admin.from('briefings').select('status, error_reason').eq('briefing_date', report.date)),
    safeData<{ status: string }>('경쟁사 주간 리포트', admin.from('competitor_weekly_reports').select('status').gte('week_start', weekStartDate).lte('week_start', report.date)),
    safeCount('일일 핵심', admin.from('daily_insights').select('id', { count: 'exact', head: true }).eq('day_of', report.date)),
    safeCount('일일 핵심 검토 대기', admin.from('daily_insights').select('id', { count: 'exact', head: true }).eq('day_of', report.date).eq('needs_review', true)),
    safeData<{ status: string }>('뉴스레터 수신자', admin.from('newsletter_recipients').select('status').gte('created_at', report.startIso).lt('created_at', report.endIso)),
    gatherCronStatuses(admin, now),
    options.forceUnavailableSection === 'usage'
      ? safeData<{ provider: string; tokens: number }>(
          'AI·외부 사용량 강제 실패',
          admin.from('__ops_brief_forced_failure').select('provider, tokens')
        )
      : safeData<{ provider: string; tokens: number }>(
          'LLM 사용량',
          admin.from('llm_usage').select('provider, tokens').eq('period', period)
        ),
    safeData<{ provider: string; monthly_token_limit: number }>('LLM 설정', admin.from('llm_settings').select('provider, monthly_token_limit').eq('enabled', true)),
    safeData<{ chars: number }>('번역 사용량', admin.from('translation_usage').select('chars').eq('period', period)),
    safeData<{ chars: number }>('TTS 사용량', admin.from('tts_usage').select('chars').eq('period', period)),
    safeData<BriefIssue>('운영 이슈', admin.from('ops_issues').select('title, severity, occurrence_count, first_seen_at, last_seen_at, recommended_action, suspected_cause, fingerprint').in('status', ['open', 'acknowledged', 'in_progress']).in('severity', ['critical', 'warning']).order('severity').order('last_seen_at', { ascending: false })),
  ])

  const reviewReasonPoints = await Promise.all(REVIEW_REASONS.map(async ([reason, label]) => {
    const result = await safeCount(
      `검토 사유 ${reason}`,
      admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('review_reason', reason).is('deleted_at', null)
    )
    return { ...result, reason, label }
  }))
  const reviewReasons: DailyBrief['collection']['reviewReasons'] = reviewReasonPoints.some(point => !point.available)
    ? { available: false, value: [] }
    : {
        available: true,
        value: reviewReasonPoints
          .map(point => ({ reason: point.reason, label: point.label, count: point.value }))
          .sort((a, b) => b.count - a.count),
      }

  const publicationTotal = sumTrendMetrics(history, [aiReportTrend, briefingTrend, insightTrend])
  const aiReports = {
    available: aiReportsPublished.available && aiReportsFailed.available,
    value: { published: aiReportsPublished.value, failed: aiReportsFailed.value },
  }
  const briefings = {
    available: briefingRows.available,
    value: {
      published: briefingRows.value.filter(row => row.status === 'published').length,
      failed: briefingRows.value.filter(row => row.status === 'failed').length,
      errors: briefingRows.value.flatMap(row => row.status === 'failed' && row.error_reason ? [row.error_reason] : []),
    },
  }
  const competitorWeekly = {
    available: competitorRows.available,
    value: [...new Set(competitorRows.value.map(row => row.status))]
      .map(status => ({ status, count: competitorRows.value.filter(row => row.status === status).length })),
  }
  const dailyInsights = {
    available: insightTotal.available && insightReview.available,
    value: { total: insightTotal.value, needsReview: insightReview.value },
  }
  const newsletter = {
    available: newsletterRows.available,
    value: statusDistribution(newsletterRows.value),
  }

  const settingsMap = new Map(settingsRows.value.map(row => [row.provider, Number(row.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT)]))
  const usageMap = new Map<string, number>()
  for (const row of llmRows.value) {
    usageMap.set(row.provider, (usageMap.get(row.provider) ?? 0) + Number(row.tokens ?? 0))
  }
  const llmUsage = {
    available: llmRows.available
      && settingsRows.available
      && options.forceUnavailableSection !== 'usage',
    value: [...usageMap].map(([provider, used]) => {
      const limit = monthlyBudget(settingsMap.get(provider))
      return { provider, used, limit, percent: pct(used, limit) }
    }),
  }
  const opsSettings = await getOpsSettings()
  const translationUsed = translationRows.value.reduce((sum, row) => sum + Number(row.chars ?? 0), 0)
  const ttsUsed = ttsRows.value.reduce((sum, row) => sum + Number(row.chars ?? 0), 0)
  const translationLimit = Number(opsSettings.translation_monthly_char_cap ?? 1_000_000)
  const ttsLimit = Number(opsSettings.tts_monthly_char_cap ?? 1_000_000)
  const translation = {
    available: translationRows.available && options.forceUnavailableSection !== 'usage',
    value: { used: translationUsed, limit: translationLimit, percent: pct(translationUsed, translationLimit) },
  }
  const tts = {
    available: ttsRows.available && options.forceUnavailableSection !== 'usage',
    value: { used: ttsUsed, limit: ttsLimit, percent: pct(ttsUsed, ttsLimit) },
  }

  const alerts: BriefAlert[] = []
  addAvailabilityAlert(alerts, collected.available, '수집')
  addAvailabilityAlert(alerts, failedJobs.available, '작업 실패')
  addAvailabilityAlert(alerts, aiReports.available && briefings.available && dailyInsights.available && newsletter.available, '발행 현황')
  addAvailabilityAlert(alerts, crons.available, 'cron 상태')
  addAvailabilityAlert(alerts, reviewReasons.available, '검토대기 사유')
  addAvailabilityAlert(alerts, sourceBreakdown.available, '소스별 수집 현황')
  addAvailabilityAlert(
    alerts,
    llmUsage.available && translation.available && tts.available,
    'AI·외부 사용량'
  )

  if (aiReports.available && aiReports.value.failed > 0) {
    alerts.push({ severity: 'critical', message: `AI 리포트 발행 실패 ${aiReports.value.failed}건` })
  }
  if (briefings.available && briefings.value.failed > 0) {
    alerts.push({ severity: 'critical', message: `모닝브리핑 발행 실패 ${briefings.value.failed}건` })
  }
  if (newsletter.available && newsletter.value.failed + newsletter.value.bounced > 0) {
    alerts.push({ severity: 'critical', message: `뉴스레터 실패·반송 ${newsletter.value.failed + newsletter.value.bounced}건` })
  }
  if (dailyInsights.available && dailyInsights.value.needsReview > 0) {
    alerts.push({ severity: 'warning', message: `일일 핵심 검토 대기 ${dailyInsights.value.needsReview}건` })
  }
  if (crons.available) {
    const stale = crons.value.filter(cron => cron.tone === 'stale').length
    const missing = crons.value.filter(cron => cron.tone === 'missing').length
    const failing = crons.value.filter(cron => cron.tone === 'failing').length
    if (missing > 0) alerts.push({ severity: 'critical', message: `cron ${missing}건 미실행` })
    if (failing > 0) alerts.push({ severity: 'critical', message: `cron ${failing}건 연속 실패` })
    if (stale > 0) alerts.push({ severity: 'warning', message: `cron ${stale}건 주의(maxAgeHours 초과)` })
  }
  if (collected.available && collected.value === 0) {
    alerts.push({ severity: 'critical', message: '전일 수집 0건 — 수집 스케줄과 소스 상태를 확인하세요.' })
  } else if (collected.available && collected.average7DeltaPct !== null && collected.average7DeltaPct <= -30) {
    alerts.push({ severity: 'warning', message: `기사 수집이 7일 평균보다 ${Math.abs(collected.average7DeltaPct)}% 감소했습니다.` })
  }
  const topSource = sourceBreakdown.value.topSources[0]
  if (sourceBreakdown.available && topSource && topSource.share >= 70) {
    alerts.push({ severity: 'warning', message: `최고 매체 ${topSource.name} 비중이 ${topSource.share}%입니다.` })
  }
  const criticalUsage = [
    ...llmUsage.value.map(item => ({ name: item.provider, percent: item.percent })),
    { name: '번역', percent: translation.value.percent },
    { name: 'TTS', percent: tts.value.percent },
  ].filter(item => item.percent >= 95)
  if (criticalUsage.length) {
    alerts.push({ severity: 'critical', message: `${criticalUsage.map(item => `${item.name} ${item.percent}%`).join(', ')} — 월 한도 95% 이상` })
  }
  if (backlog.available && backlog.value > 100) {
    alerts.push({ severity: 'warning', message: `본문 보강 대기 ${backlog.value.toLocaleString()}건` })
  }
  if (crawlPartial.available && crawlPartial.value > 0) {
    alerts.push({ severity: 'warning', message: `수집 일부 실패 ${crawlPartial.value}건` })
  }

  const issues = issuesResult.available ? issuesResult.value : []
  for (const issue of issues) {
    if (REPORT_DUPLICATE_ISSUE_FINGERPRINTS.has(issue.fingerprint)) continue
    const cause = issue.suspected_cause ? ` — ${issue.suspected_cause}` : ''
    alerts.push({
      severity: issue.severity,
      message: `${issue.title}${cause}${issue.recommended_action ? ` · 권장: ${issue.recommended_action}` : ''}`,
    })
  }
  if (!alerts.length) alerts.push({ severity: 'notice', message: '주요 시스템 정상' })

  const severity = alerts.some(alert => alert.severity === 'critical')
    ? 'critical'
    : alerts.some(alert => alert.severity === 'warning')
      ? 'warning'
      : 'normal'

  return {
    date: now.toISOString(),
    period: {
      date: report.date,
      startIso: report.startIso,
      endIso: report.endIso,
      rangeLabel: periodLabel(report),
      generatedLabel: `${formatKstDateTime(now.toISOString())} KST`,
    },
    severity,
    alerts,
    issues,
    system: {
      crawlFailed,
      crawlPartial,
      backlog,
      failedJobs,
    },
    collection: {
      collected,
      published,
      rejected,
      pending,
      sourceBreakdown,
      activeSources,
      reviewReasons,
    },
    publication: {
      total: publicationTotal,
      aiReports,
      briefings,
      competitorWeekly,
      dailyInsights,
      newsletter,
    },
    crons,
    usage: {
      llm: llmUsage,
      translation,
      tts,
    },
    users: {
      total: totalUsers,
      newUsers,
      pending: pendingUsers,
      inactive7d: inactiveUsers,
    },
  }
}

const esc = (value: unknown): string => String(value).replace(
  /[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)
)

function pointText(point: DataPoint<number>, suffix = '건'): string {
  return point.available ? `${point.value.toLocaleString()}${suffix}` : '데이터를 불러오지 못했습니다'
}

function comparisonText(metric: TrendMetric): string {
  if (!metric.available) return '데이터를 불러오지 못했습니다'
  const delta = (value: number | null) => value === null ? '비교 불가' : `${value >= 0 ? '+' : ''}${value}%`
  return `전일 ${delta(metric.previousDeltaPct)} · 7일평균 ${delta(metric.average7DeltaPct)}`
}

function statusForMetric(metric: TrendMetric, criticalWhenZero = false): DataStatus {
  if (!metric.available) return 'unavailable'
  if (criticalWhenZero && metric.value === 0) return 'critical'
  if (metric.average7DeltaPct !== null && metric.average7DeltaPct <= -30) return 'warning'
  return 'normal'
}

const STATUS_STYLE: Record<DataStatus, { background: string; border: string; color: string; badge: string }> = {
  normal: { background: '#ffffff', border: '#d7dce2', color: '#202124', badge: '정상' },
  warning: { background: '#fff7ed', border: '#fdba74', color: '#9a3412', badge: '주의' },
  critical: { background: '#fef2f2', border: '#fca5a5', color: '#991b1b', badge: '긴급' },
  unavailable: { background: '#f3f4f6', border: '#d1d5db', color: '#6b7280', badge: '확인 필요' },
}

function card(label: string, value: string, detail: string, status: DataStatus): string {
  const style = STATUS_STYLE[status]
  return `<td width="20%" valign="top" class="summary-card" style="width:20%;padding:4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:${style.background};border:1px solid ${style.border};border-radius:10px">
      <tr><td height="36" valign="top" style="height:36px;padding:10px 8px 2px;color:${style.color};font-size:11px;line-height:14px;font-weight:700">${esc(label)}</td></tr>
      <tr><td height="27" valign="top" style="height:27px;padding:0 8px;color:${style.color};font-size:18px;line-height:23px;font-weight:800;white-space:nowrap">${esc(value)}</td></tr>
      <tr><td height="40" valign="top" style="height:40px;padding:3px 8px 9px;color:${style.color};font-size:10px;line-height:14px">${esc(detail)}</td></tr>
    </table>
  </td>`
}

function sectionTitle(index: string, title: string): string {
  return `<tr><td style="padding:28px 20px 10px;color:#111827;font-size:16px;line-height:22px;font-weight:800">${index} ${esc(title)}</td></tr>`
}

function trendBars(metric: TrendMetric): string {
  if (!metric.available) {
    return '<p style="margin:0;color:#6b7280;font-size:12px">데이터를 불러오지 못했습니다</p>'
  }
  const max = Math.max(...metric.history.map(point => point.value), 1)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${metric.history.map(point => {
      const width = Math.max(point.value > 0 ? 3 : 0, Math.round(point.value / max * 100))
      return `<tr>
        <td width="52" style="padding:2px 6px 2px 0;color:#6b7280;font-size:10px">${esc(point.date.slice(5))}</td>
        <td style="padding:2px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef0f3">
            <tr><td style="width:${width}%;height:7px;background:#8b1d5a;font-size:0;line-height:0">&nbsp;</td><td style="height:7px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td>
        <td width="48" align="right" style="padding:2px 0 2px 6px;color:#374151;font-size:10px">${point.value.toLocaleString()}</td>
      </tr>`
    }).join('')}
  </table>`
}

function dataRow(label: string, value: string, status: DataStatus = 'normal'): string {
  const style = STATUS_STYLE[status]
  return `<tr>
    <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:12px">${esc(label)}</td>
    <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:${style.color};font-size:12px;font-weight:${status === 'critical' ? '800' : '600'}">${esc(value)}</td>
  </tr>`
}

function usageStatus(percent: number): DataStatus {
  if (percent >= 95) return 'critical'
  if (percent >= 80) return 'warning'
  return 'normal'
}

export function buildDailyBriefSubject(brief: DailyBrief): string {
  const date = new Date(`${brief.period.date}T00:00:00+09:00`).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  })
  const prefix = brief.severity === 'critical' ? '[위험]' : brief.severity === 'warning' ? '[주의]' : ''
  if (brief.severity === 'normal') {
    const issued = brief.publication.total.available ? `${brief.publication.total.value}건` : '확인 필요'
    const users = brief.users.newUsers.available ? `${brief.users.newUsers.value}명` : '확인 필요'
    return `[인사이트 아웃 운영리포트] ${date} · 정상 · 발행 ${issued} · 신규 가입 ${users}`
  }
  const important = brief.alerts
    .filter(alert => alert.severity === (brief.severity === 'critical' ? 'critical' : 'warning'))
    .slice(0, 2)
    .map((alert) => {
      const usageMatch = alert.message.match(/^([a-z0-9_-]+) \d+% — 월 한도/i)
      if (usageMatch) return `${usageMatch[1]} 한도 초과`
      const cronMatch = alert.message.match(/^cron (\d+)건 (미실행|주의)/)
      if (cronMatch) return `cron ${cronMatch[1]}건 ${cronMatch[2]}`
      return alert.message
        .replace(/ — .*/, '')
        .replace(/입니다\.?$/, '')
        .replace(/발행 실패 (\d+)건$/, '실패 $1건')
    })
  const subject = `${prefix}[인사이트 아웃 운영리포트] ${date} · ${important.join(' · ') || '확인 필요'}`
  return subject.length > 70 ? `${subject.slice(0, 69)}…` : subject
}

export function buildDailyBriefHtml(brief: DailyBrief): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'
  const overall = STATUS_STYLE[brief.severity === 'normal' ? 'normal' : brief.severity]
  const alertRows = brief.alerts.map(alert => {
    const status = alert.severity === 'notice' ? 'normal' : alert.severity
    const style = STATUS_STYLE[status]
    return `<tr><td style="padding:10px 12px;border-bottom:1px solid ${style.border};background:${style.background};color:${style.color};font-size:12px;line-height:18px;font-weight:${status === 'critical' ? '800' : '600'}">[${style.badge}] ${esc(alert.message)}</td></tr>`
  }).join('')
  const failedJobsStatus: DataStatus = !brief.system.failedJobs.available
    ? 'unavailable'
    : brief.system.failedJobs.value > 0 ? 'critical' : 'normal'
  const publicationFailureCount = (
    brief.publication.aiReports.value.failed
    + brief.publication.briefings.value.failed
    + brief.publication.newsletter.value.failed
    + brief.publication.newsletter.value.bounced
  )
  const publicationStatus: DataStatus = !brief.publication.total.available
    || !brief.publication.aiReports.available
    || !brief.publication.briefings.available
    || !brief.publication.dailyInsights.available
    || !brief.publication.newsletter.available
    ? 'unavailable'
    : publicationFailureCount > 0 ? 'critical' : 'normal'
  const cronCounts = brief.crons.available
    ? {
        ok: brief.crons.value.filter(cron => cron.tone === 'ok').length,
        stale: brief.crons.value.filter(cron => cron.tone === 'stale').length,
        missing: brief.crons.value.filter(cron => cron.tone === 'missing').length,
        failing: brief.crons.value.filter(cron => cron.tone === 'failing').length,
      }
    : null
  const reviewRows = brief.collection.reviewReasons.available
    ? brief.collection.reviewReasons.value.slice(0, 4).map(item => dataRow(item.label, `${item.count.toLocaleString()}건`)).join('')
    : dataRow('검토 사유', '데이터를 불러오지 못했습니다', 'unavailable')
  const llmRows = brief.usage.llm.available
    ? brief.usage.llm.value.map(item => dataRow(
        item.provider,
        `${item.used.toLocaleString()} / ${item.limit.toLocaleString()} 토큰 (${item.percent}%)${item.percent >= 95 ? ' [긴급]' : ''}`,
        usageStatus(item.percent)
      )).join('')
    : dataRow('LLM', '데이터를 불러오지 못했습니다', 'unavailable')
  const cronRows = brief.crons.available
    ? brief.crons.value
        .filter(cron => cron.tone !== 'ok')
        .map(cron => dataRow(
          cron.label,
          cron.tone === 'missing'
            ? '미실행'
            : cron.tone === 'failing'
              ? `연속 실패 · 마지막 성공 ${cron.lastSuccessAt ? formatKstDateTime(cron.lastSuccessAt) : '없음'} KST`
              : `주의 · 마지막 ${cron.lastAt ? formatKstDateTime(cron.lastAt) : '없음'} KST`,
          cron.tone === 'missing' || cron.tone === 'failing' ? 'critical' : 'warning'
        )).join('') || dataRow('전체 cron', 'maxAgeHours 기준 정상')
    : dataRow('cron 상태', '데이터를 불러오지 못했습니다', 'unavailable')
  const sourceCategoryRows = brief.collection.sourceBreakdown.available
    ? brief.collection.sourceBreakdown.value.categories.map(item => `<tr>
        <td width="86" style="padding:7px 8px;color:#374151;font-size:11px">${esc(item.category)}</td>
        <td style="padding:7px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef0f3">
            <tr><td style="width:${item.share}%;height:8px;background:#8b1d5a;font-size:0;line-height:0">&nbsp;</td><td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td>
        <td width="82" align="right" style="padding:7px 8px;color:#374151;font-size:11px;font-weight:700">${item.count.toLocaleString()}건 · ${item.share}%</td>
      </tr>`).join('')
    : dataRow('카테고리별 수집', '데이터를 불러오지 못했습니다', 'unavailable')
  const sourceTopRows = brief.collection.sourceBreakdown.available
    ? brief.collection.sourceBreakdown.value.topSources.map((item, index) => `<tr>
        <td width="28" style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px">${index + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#202124;font-size:11px;font-weight:700">${esc(item.name)}</td>
        <td width="72" style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px">${esc(item.category)}</td>
        <td width="84" align="right" style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:11px">${item.count.toLocaleString()}건 · ${item.share}%</td>
      </tr>`).join('') || dataRow('Top 5', '지정된 소스 없음')
    : dataRow('소스 Top 5', '데이터를 불러오지 못했습니다', 'unavailable')
  const unspecifiedSourceRow = brief.collection.sourceBreakdown.available
    ? dataRow(
        '소스 미지정',
        `${brief.collection.sourceBreakdown.value.unspecified.count.toLocaleString()}건 (${brief.collection.sourceBreakdown.value.unspecified.share}%)`,
        brief.collection.sourceBreakdown.value.unspecified.count > 0 ? 'warning' : 'normal'
      )
    : dataRow('소스 미지정', '데이터를 불러오지 못했습니다', 'unavailable')

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style>:root{color-scheme:light only;}</style>
  <style>@media only screen and (max-width:480px){.summary-card{display:block!important;width:100%!important;box-sizing:border-box!important}}</style>
  <title>${esc(buildDailyBriefSubject(brief))}</title>
</head>
<body bgcolor="#eef0f3" style="margin:0;padding:0;background:#eef0f3;background-color:#eef0f3;color:#202124;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef0f3" style="border-collapse:collapse;background:#eef0f3;background-color:#eef0f3">
    <tr><td align="center" style="padding:20px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;background-color:#ffffff;border:1px solid #d7dce2;border-radius:12px">
        <tr><td style="padding:24px 20px;background:#202124;color:#ffffff;border-radius:12px 12px 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="top"><div style="font-size:11px;color:#d1d5db;letter-spacing:.08em">INSIGHT OUT</div><div style="margin-top:6px;font-size:22px;line-height:29px;font-weight:800">일일 운영리포트</div></td>
            <td width="72" align="right" valign="top"><span style="display:inline-block;padding:5px 8px;background:${overall.background};border:1px solid ${overall.border};border-radius:6px;color:${overall.color};font-size:11px;font-weight:800">${overall.badge}</span></td>
          </tr></table>
          <div style="margin-top:14px;color:#e5e7eb;font-size:11px;line-height:18px">집계 기간: ${esc(brief.period.rangeLabel)}<br>생성: ${esc(brief.period.generatedLabel)}</div>
        </td></tr>

        ${sectionTitle('①', '오늘 반드시 확인')}
        <tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid ${overall.border};border-radius:8px;overflow:hidden">${alertRows}</table></td></tr>

        ${sectionTitle('②', '한눈에 보기')}
        <tr><td style="padding:0 14px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              ${card('수집', brief.collection.collected.available ? `${brief.collection.collected.value.toLocaleString()}건` : '확인 필요', comparisonText(brief.collection.collected), statusForMetric(brief.collection.collected, true))}
              ${card('게시', brief.collection.published.available ? `${brief.collection.published.value.toLocaleString()}건` : '확인 필요', comparisonText(brief.collection.published), statusForMetric(brief.collection.published))}
              ${card('검토대기', pointText(brief.collection.pending), '현재 백로그', brief.collection.pending.available ? (brief.collection.pending.value > 100 ? 'warning' : 'normal') : 'unavailable')}
              ${card('발행', brief.publication.total.available ? `${brief.publication.total.value.toLocaleString()}건` : '확인 필요', comparisonText(brief.publication.total), publicationStatus)}
              ${card('실패작업', pointText(brief.system.failedJobs), '전일 failed만', failedJobsStatus)}
            </tr>
          </table>
        </td></tr>

        ${sectionTitle('③', '발행 현황')}
        <tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">
          ${dataRow('AI 리포트', brief.publication.aiReports.available ? `발행 ${brief.publication.aiReports.value.published} · 실패 ${brief.publication.aiReports.value.failed}` : '데이터를 불러오지 못했습니다', brief.publication.aiReports.available ? (brief.publication.aiReports.value.failed ? 'critical' : 'normal') : 'unavailable')}
          ${dataRow('모닝브리핑', brief.publication.briefings.available ? `발행 ${brief.publication.briefings.value.published} · 실패 ${brief.publication.briefings.value.failed}` : '데이터를 불러오지 못했습니다', brief.publication.briefings.available ? (brief.publication.briefings.value.failed ? 'critical' : 'normal') : 'unavailable')}
          ${dataRow('경쟁사 주간', brief.publication.competitorWeekly.available ? (brief.publication.competitorWeekly.value.map(item => `${item.status} ${item.count}`).join(' · ') || '해당 주 기록 없음') : '데이터를 불러오지 못했습니다', brief.publication.competitorWeekly.available ? 'normal' : 'unavailable')}
          ${dataRow('일일 핵심', brief.publication.dailyInsights.available ? `발행 ${brief.publication.dailyInsights.value.total} · 검토대기 ${brief.publication.dailyInsights.value.needsReview}` : '데이터를 불러오지 못했습니다', brief.publication.dailyInsights.available ? (brief.publication.dailyInsights.value.needsReview ? 'warning' : 'normal') : 'unavailable')}
          ${dataRow('뉴스레터', brief.publication.newsletter.available ? `전체 ${brief.publication.newsletter.value.total} · 성공률 ${brief.publication.newsletter.value.successRate}% · 실패 ${brief.publication.newsletter.value.failed} · 반송 ${brief.publication.newsletter.value.bounced}` : '데이터를 불러오지 못했습니다', brief.publication.newsletter.available ? (brief.publication.newsletter.value.failed + brief.publication.newsletter.value.bounced ? 'critical' : 'normal') : 'unavailable')}
        </table></td></tr>

        ${sectionTitle('④', '소스별 수집 현황')}
        <tr><td style="padding:0 20px">
          <div style="padding:0 0 7px;color:#374151;font-size:12px;font-weight:700">카테고리별 수집</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">${sourceCategoryRows}</table>
          <div style="padding:16px 0 7px;color:#374151;font-size:12px;font-weight:700">소스 Top 5</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">${sourceTopRows}${unspecifiedSourceRow}</table>
          <div style="padding-top:8px;color:#6b7280;font-size:10px;line-height:15px">모든 비중의 분모는 전일 전체 수집 ${brief.collection.sourceBreakdown.available ? `${brief.collection.sourceBreakdown.value.total.toLocaleString()}건` : '데이터 확인 필요'}입니다.</div>
        </td></tr>

        ${sectionTitle('⑤', '수집·콘텐츠 건강')}
        <tr><td style="padding:0 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">
            ${dataRow('수집 실패', pointText(brief.system.crawlFailed), brief.system.crawlFailed.available ? (brief.system.crawlFailed.value ? 'critical' : 'normal') : 'unavailable')}
            ${dataRow('수집 부분 실패', pointText(brief.system.crawlPartial), brief.system.crawlPartial.available ? (brief.system.crawlPartial.value ? 'warning' : 'normal') : 'unavailable')}
            ${dataRow('본문 보강 대기', pointText(brief.system.backlog), brief.system.backlog.available ? (brief.system.backlog.value > 100 ? 'warning' : 'normal') : 'unavailable')}
            ${brief.system.trashCleanup ? dataRow(
              '휴지통 정리(30일 초과)',
              brief.system.trashCleanup.available
                ? `${brief.system.trashCleanup.value.deleted.toLocaleString()}건${brief.system.trashCleanup.value.capped ? ' (상한 도달 — 다음 실행에 계속)' : ''}`
                : '조회 불가',
              brief.system.trashCleanup.available ? (brief.system.trashCleanup.value.capped ? 'warning' : 'normal') : 'unavailable'
            ) : ''}
            ${reviewRows}
          </table>
          <div style="padding:14px 0 0;color:#374151;font-size:12px;font-weight:700">수집량 14일 추이</div>
          <div style="padding:8px 0 0">${trendBars(brief.collection.collected)}</div>
        </td></tr>

        ${sectionTitle('⑥', '사용자')}
        <tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">
          ${dataRow('가입 현황', brief.users.total.available && brief.users.newUsers.available ? `누적 ${brief.users.total.value.toLocaleString()}명 · 신규 ${brief.users.newUsers.value.toLocaleString()}명 (${comparisonText(brief.users.newUsers)})` : '데이터를 불러오지 못했습니다', brief.users.total.available && brief.users.newUsers.available ? 'normal' : 'unavailable')}
          ${dataRow('승인 대기', pointText(brief.users.pending, '명'), brief.users.pending.available ? (brief.users.pending.value ? 'warning' : 'normal') : 'unavailable')}
          ${dataRow('7일 미접속', pointText(brief.users.inactive7d, '명'), brief.users.inactive7d.available ? 'normal' : 'unavailable')}
        </table></td></tr>

        ${sectionTitle('⑦', 'AI·외부 사용량')}
        <tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">
          ${llmRows}
          ${dataRow('번역', brief.usage.translation.available ? `${brief.usage.translation.value.used.toLocaleString()} / ${brief.usage.translation.value.limit.toLocaleString()}자 (${brief.usage.translation.value.percent}%)${brief.usage.translation.value.percent >= 95 ? ' [긴급]' : ''}` : '데이터를 불러오지 못했습니다', brief.usage.translation.available ? usageStatus(brief.usage.translation.value.percent) : 'unavailable')}
          ${dataRow('TTS', brief.usage.tts.available ? `${brief.usage.tts.value.used.toLocaleString()} / ${brief.usage.tts.value.limit.toLocaleString()}자 (${brief.usage.tts.value.percent}%)${brief.usage.tts.value.percent >= 95 ? ' [긴급]' : ''}` : '데이터를 불러오지 못했습니다', brief.usage.tts.available ? usageStatus(brief.usage.tts.value.percent) : 'unavailable')}
        </table></td></tr>

        ${sectionTitle('⑧', 'cron 상태')}
        <tr><td style="padding:0 20px">
          <div style="padding:10px 12px;background:#f3f4f6;color:#374151;font-size:12px;font-weight:700">${cronCounts ? `정상 ${cronCounts.ok} / 주의 ${cronCounts.stale} / 미실행 ${cronCounts.missing} / 연속 실패 ${cronCounts.failing}` : '데이터를 불러오지 못했습니다'}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7dce2">${cronRows}</table>
          <div style="padding-top:8px;color:#6b7280;font-size:10px;line-height:15px">Vercel Hobby 실행 시각 오차는 이상으로 판단하지 않으며, 각 작업의 maxAgeHours 초과 여부만 사용합니다.</div>
        </td></tr>

        ${sectionTitle('⑨', '조치 필요 항목')}
        <tr><td style="padding:0 20px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr><td align="center" style="padding:14px;background:#f3f4f6;border:1px solid #d7dce2;border-radius:8px">
              <a href="${esc(appUrl)}/admin" style="color:#7a174e;font-size:13px;font-weight:800;text-decoration:none">어드민 운영 대시보드 열기 →</a>
              &nbsp;&nbsp;
              <a href="${esc(appUrl)}/admin/job-runs" style="color:#7a174e;font-size:13px;font-weight:800;text-decoration:none">작업 이력 확인 →</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
