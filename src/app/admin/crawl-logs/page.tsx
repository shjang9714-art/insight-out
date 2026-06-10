import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '크롤링 현황 | 어드민 | Insight Out',
  description: '소스별 자동 수집 실행 로그',
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type CrawlStatus = 'success' | 'partial' | 'failed'

interface CrawlLog {
  id: string
  status: CrawlStatus
  fetched_count: number
  inserted_count: number
  duplicate_count: number
  held_count: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  sources: { name: string } | null
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<CrawlStatus, { label: string; cls: string }> = {
  success: {
    label: '성공',
    cls: 'bg-green-50 text-green-700 border border-green-100',
  },
  partial: {
    label: '부분',
    cls: 'bg-yellow-50 text-yellow-700 border border-yellow-100',
  },
  failed: {
    label: '실패',
    cls: 'bg-red-50 text-red-700 border border-red-100',
  },
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

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

/** started_at ~ finished_at 소요 초 */
function elapsedSec(started: string | null, finished: string | null): string {
  if (!started || !finished) return '—'
  const sec = Math.round(
    (new Date(finished).getTime() - new Date(started).getTime()) / 1000
  )
  return `${sec}초`
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function CrawlLogsPage() {
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

  const { data } = await supabase
    .from('crawl_logs')
    .select(
      'id, status, fetched_count, inserted_count, duplicate_count, held_count, error_message, started_at, finished_at, created_at, sources(name)'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const logs = (data ?? []) as unknown as CrawlLog[]

  // ── 요약 집계 (최근 24h, 없으면 전체) ──────────────────────────────────────
  // ISO 문자열 비교로 24h 필터 (Date.now() purity 규칙 회피)
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - 24)
  const cutoffIso = cutoffDate.toISOString()
  const recent = logs.filter((l) => l.created_at >= cutoffIso)
  const summaryLogs = recent.length > 0 ? recent : logs

  const successCount  = summaryLogs.filter((l) => l.status === 'success').length
  const partialCount  = summaryLogs.filter((l) => l.status === 'partial').length
  const failedCount   = summaryLogs.filter((l) => l.status === 'failed').length
  const totalInserted = summaryLogs.reduce((s, l) => s + l.inserted_count, 0)
  const lastRunAt     = logs[0]?.created_at ?? null

  // ── 요약 카드 데이터 ──────────────────────────────────────────────────────
  const summaryCards = [
    { label: '마지막 실행',    value: lastRunAt ? formatKST(lastRunAt) : '—' },
    { label: '성공',          value: `${successCount}건`,  accent: successCount > 0 ? 'text-green-600' : '' },
    { label: '부분',          value: `${partialCount}건`,  accent: partialCount > 0 ? 'text-yellow-600' : '' },
    { label: '실패',          value: `${failedCount}건`,   accent: failedCount > 0 ? 'text-red-600 font-semibold' : '' },
    { label: '신규 적재(합)', value: `${totalInserted.toLocaleString()}건` },
  ]

  return (
    <>
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">크롤링 현황</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          소스별 자동 수집 실행 로그입니다. 최근 100건, 마지막 24시간 기준 요약.
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      {/* 로그 표 */}
      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          아직 수집 기록이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">실행 시각 (KST)</th>
                <th className="px-4 py-3">소스</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">가져옴</th>
                <th className="px-4 py-3 text-right">신규</th>
                <th className="px-4 py-3 text-right">중복</th>
                <th className="px-4 py-3 text-right">보류</th>
                <th className="px-4 py-3 text-right">소요</th>
                <th className="px-4 py-3">에러</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => {
                const badge = STATUS_BADGE[log.status] ?? STATUS_BADGE.failed
                return (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-accent/50"
                  >
                    {/* 실행 시각 */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatKST(log.created_at)}
                    </td>

                    {/* 소스명 */}
                    <td className="px-4 py-3 text-xs font-medium text-foreground">
                      {log.sources?.name ?? '—'}
                    </td>

                    {/* 상태 배지 */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* 가져옴 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-foreground">
                      {log.fetched_count.toLocaleString()}
                    </td>

                    {/* 신규 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-green-700">
                      {log.inserted_count > 0 ? `+${log.inserted_count}` : '0'}
                    </td>

                    {/* 중복 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {log.duplicate_count.toLocaleString()}
                    </td>

                    {/* 보류 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {log.held_count.toLocaleString()}
                    </td>

                    {/* 소요 */}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                      {elapsedSec(log.started_at, log.finished_at)}
                    </td>

                    {/* 에러 */}
                    <td className="max-w-[200px] px-4 py-3">
                      {log.error_message ? (
                        <span
                          className="line-clamp-2 text-[11px] text-red-500"
                          title={log.error_message}
                        >
                          {log.error_message}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
