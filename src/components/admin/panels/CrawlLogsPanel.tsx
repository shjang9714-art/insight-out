import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import CrawlLogsTable, { type CrawlLogRow } from '@/components/admin/CrawlLogsTable'
import { parseProviderCounts, type ProviderCounts } from '@/lib/admin/crawl-providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

/** ISO 문자열 → KST 날짜+시각 표기 */
function formatKST(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface DecodeStats {
  attempted: number
  succeeded: number
  failed: number
  recovered: number
}

function parseDecodeStats(meta: unknown): DecodeStats | null {
  if (!meta || typeof meta !== 'object') return null
  const decodeStats = (meta as Record<string, unknown>).decodeStats
  if (!decodeStats || typeof decodeStats !== 'object') return null
  const value = decodeStats as Record<string, unknown>

  if (
    typeof value.attempted !== 'number' ||
    typeof value.succeeded !== 'number' ||
    typeof value.failed !== 'number'
  ) {
    return null
  }

  return {
    attempted: value.attempted,
    succeeded: value.succeeded,
    failed: value.failed,
    recovered: typeof value.recovered === 'number' ? value.recovered : 0,
  }
}

interface CrawlLogsPanelProps {
  searchParams: { page?: string }
}

/** 524 — crawl-logs/page.tsx 에서 이식. 데이터 로딩 로직 불변, AdminPageHeader 만 제거(허브가 대신 렌더). */
export default async function CrawlLogsPanel({ searchParams }: CrawlLogsPanelProps) {
  const parsedPage = Number.parseInt(searchParams.page ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  // ── 서버 Supabase client (쿠키 기반, RLS admin 통과) ─────────────────────────
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

  let { data, error, count } = await supabase
    .from('crawl_logs')
    .select(
      'id, status, fetched_count, inserted_count, duplicate_count, held_count, rejected_count, rejected_by, error_message, started_at, finished_at, created_at, source_id, sources(name, type)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  // 312 SQL(rejected_count/rejected_by) 미적용 시 undefined_column — 해당 컬럼 없이 재조회.
  if (error?.code === '42703') {
    console.error('[/admin/job-runs (crawl-logs 탭)] crawl_logs.rejected_count/rejected_by 컬럼 미적용(312 SQL 미실행) — 해당 컬럼 없이 조회:', error.message)
    const retry = await supabase
      .from('crawl_logs')
      .select(
        'id, status, fetched_count, inserted_count, duplicate_count, held_count, error_message, started_at, finished_at, created_at, source_id, sources(name, type)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    data = retry.data as unknown as typeof data
    error = retry.error
    count = retry.count
  }

  const logs = (data ?? []) as unknown as CrawlLogRow[]

  // 상단 요약은 이관 전과 동일하게 최신 100건을 기준으로 계산한다.
  let summaryResult = await supabase
    .from('crawl_logs')
    .select('status, inserted_count, rejected_count, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (summaryResult.error?.code === '42703') {
    summaryResult = await supabase
      .from('crawl_logs')
      .select('status, inserted_count, created_at')
      .order('created_at', { ascending: false })
      .limit(100) as unknown as typeof summaryResult
  }
  const summaryRows = (summaryResult.data ?? []) as Pick<CrawlLogRow, 'status' | 'inserted_count' | 'rejected_count' | 'created_at'>[]

  // job_runs는 service_role 전용이다. 아직 테이블/진단 필드가 없거나 조회가 실패하면
  // 기존 크롤 로그 화면은 그대로 유지하고 공급자 진단만 숨긴다.
  let latestProviders: ProviderCounts | null = null
  let latestProviderRunAt: string | null = null
  try {
    const admin = createAdminClient()
    const providerRun = await admin
      .from('job_runs')
      .select('started_at, meta')
      .eq('job_key', 'cron:crawl')
      .in('status', ['succeeded', 'failed'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (providerRun.error) {
      if (providerRun.error.code !== '42P01') {
        console.error('[/admin/job-runs (crawl-logs 탭)] 최신 크롤 공급자 집계 조회 실패:', providerRun.error.message)
      }
    } else if (providerRun.data) {
      latestProviders = parseProviderCounts(providerRun.data.meta)
      latestProviderRunAt = providerRun.data.started_at
    }
  } catch (providerError) {
    console.error('[/admin/job-runs (crawl-logs 탭)] 최신 크롤 공급자 집계 조회 오류:', providerError)
  }

  // 449-A — 최신 본문 백필의 Google News 원문 URL 해소 성능. 구버전 meta나
  // job_runs 조회 실패에서는 기존 화면을 유지하고 이 소절만 숨긴다.
  let latestDecodeStats: DecodeStats | null = null
  let latestDecodeRunAt: string | null = null
  try {
    const admin = createAdminClient()
    const decodeRun = await admin
      .from('job_runs')
      .select('started_at, meta')
      .eq('job_key', 'cron:body-backfill')
      .in('status', ['succeeded', 'failed'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (decodeRun.error) {
      if (decodeRun.error.code !== '42P01') {
        console.error('[/admin/job-runs (crawl-logs 탭)] 최신 본문 디코드 집계 조회 실패:', decodeRun.error.message)
      }
    } else if (decodeRun.data) {
      latestDecodeStats = parseDecodeStats(decodeRun.data.meta)
      latestDecodeRunAt = decodeRun.data.started_at
    }
  } catch (decodeError) {
    console.error('[/admin/job-runs (crawl-logs 탭)] 최신 본문 디코드 집계 조회 오류:', decodeError)
  }

  // ── 요약 집계 (최근 24h, 없으면 전체) ──────────────────────────────────────
  // ISO 문자열 비교로 24h 필터 (Date.now() purity 규칙 회피)
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - 24)
  const cutoffIso = cutoffDate.toISOString()
  const recent = summaryRows.filter((log) => log.created_at >= cutoffIso)
  const summaryLogs = recent.length > 0 ? recent : summaryRows

  const successCount  = summaryLogs.filter((l) => l.status === 'success').length
  const partialCount  = summaryLogs.filter((l) => l.status === 'partial').length
  const failedCount   = summaryLogs.filter((l) => l.status === 'failed').length
  const totalInserted = summaryLogs.reduce((s, l) => s + l.inserted_count, 0)
  // rejected_count 가 하나라도 null(SQL 미적용)이면 합계 자체가 의미 없으므로 '—' 표시.
  const rejectedKnown = summaryLogs.every((l) => l.rejected_count != null)
  const totalRejected = summaryLogs.reduce((s, l) => s + (l.rejected_count ?? 0), 0)
  const lastRunAt     = summaryRows[0]?.created_at ?? null

  // ── 요약 카드 데이터 ──────────────────────────────────────────────────────
  const summaryCards = [
    { label: '마지막 실행',    value: lastRunAt ? formatKST(lastRunAt) : '—' },
    { label: '성공',          value: `${successCount}건`,  accent: successCount > 0 ? 'text-positive' : '' },
    { label: '부분',          value: `${partialCount}건`,  accent: partialCount > 0 ? 'text-yellow-600' : '' },
    { label: '실패',          value: `${failedCount}건`,   accent: failedCount > 0 ? 'text-negative font-semibold' : '' },
    { label: '신규 적재(합)', value: `${totalInserted.toLocaleString()}건` },
    { label: '제외(합)',      value: rejectedKnown ? `${totalRejected.toLocaleString()}건` : '—' },
  ]
  const effectiveDecodeFailures = latestDecodeStats
    ? Math.max(0, latestDecodeStats.failed - latestDecodeStats.recovered)
    : 0
  const decodeFailureRate = latestDecodeStats && latestDecodeStats.attempted > 0
    ? Math.round((effectiveDecodeFailures / latestDecodeStats.attempted) * 100)
    : 0

  return (
    <>
      {latestProviders && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4" aria-labelledby="provider-summary-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="provider-summary-title" className="text-sm font-semibold text-foreground">
              최신 자동 수집 공급자
            </h2>
            <p className="text-xs text-muted-foreground">
              cron:crawl · {formatKST(latestProviderRunAt)}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'Google 키워드', value: latestProviders.keyword_google, warn: false },
              { label: '네이버', value: latestProviders.keyword_naver, warn: latestProviders.keyword_naver === 0 },
              { label: 'GDELT', value: latestProviders.keyword_gdelt, warn: latestProviders.keyword_gdelt === 0 },
              { label: 'Google 회사', value: latestProviders.company_google, warn: false },
            ].map((provider) => (
              <span
                key={provider.label}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                  provider.warn
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                    : 'border-border bg-muted/50 text-muted-foreground'
                )}
              >
                {provider.label} {provider.value.toLocaleString()}건
              </span>
            ))}
          </div>
          {(latestProviders.keyword_phase_skipped ||
            latestProviders.keyword_naver === 0 ||
            latestProviders.keyword_gdelt === 0) && (
            <div className="mt-3 space-y-1 text-xs text-amber-600">
              {latestProviders.keyword_phase_skipped && (
                <p>키워드 검색 단계가 건너뛰어졌습니다. 검색 시드 설정과 개별 소스 실행 여부를 확인해주세요.</p>
              )}
              {latestProviders.keyword_naver === 0 && (
                <p>네이버 0건: API 키 설정 또는 해당 시드의 검색 결과를 확인해주세요.</p>
              )}
              {latestProviders.keyword_gdelt === 0 && (
                <p>GDELT 0건: GDELT 활성 설정 또는 해당 시드의 검색 결과를 확인해주세요.</p>
              )}
            </div>
          )}
        </section>
      )}

      {latestDecodeStats && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4" aria-labelledby="decode-summary-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="decode-summary-title" className="text-sm font-semibold text-foreground">
              구글뉴스 원문 해소
            </h2>
            <p className="text-xs text-muted-foreground">
              cron:body-backfill · {formatKST(latestDecodeRunAt)}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: '성공', value: `${latestDecodeStats.succeeded.toLocaleString()}건`, warn: false },
              { label: '실패', value: `${latestDecodeStats.failed.toLocaleString()}건`, warn: decodeFailureRate >= 50 },
              { label: '제목검색 복구', value: `${latestDecodeStats.recovered.toLocaleString()}건`, warn: false },
              { label: '실질 실패율', value: `${decodeFailureRate}%`, warn: decodeFailureRate >= 50 },
            ].map((stat) => (
              <span
                key={stat.label}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                  stat.warn
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                    : 'border-border bg-muted/50 text-muted-foreground'
                )}
              >
                {stat.label} {stat.value}
              </span>
            ))}
          </div>
          {decodeFailureRate >= 50 && latestDecodeStats.attempted > 0 && (
            <p className="mt-3 text-xs text-amber-600">
              원문 해소 실패율이 50% 이상입니다. 구글뉴스 디코드 응답 형식과 네트워크 상태를 확인해주세요.
            </p>
          )}
        </section>
      )}

      {/* 요약 카드 */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">{card.label}</p>
            <p className={`text-sm font-semibold text-foreground ${card.accent ?? ''}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* 로그 표 (클라이언트 컴포넌트 — 드릴다운·소스 대구분 배지) */}
      <CrawlLogsTable
        logs={logs}
        state={error ? 'error' : count === 0 ? 'empty' : 'idle'}
        errorMessage={error ? `수집 기록을 불러오지 못했습니다: ${error.message}` : undefined}
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
      />
    </>
  )
}
