import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import CrawlLogsTable, { type CrawlLogRow } from '@/components/admin/CrawlLogsTable'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '크롤링 현황 | 어드민 | Insight Out',
  description: '소스별 자동 수집 실행 로그',
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
      'id, status, fetched_count, inserted_count, duplicate_count, held_count, error_message, started_at, finished_at, created_at, source_id, sources(name, type)'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const logs = (data ?? []) as unknown as CrawlLogRow[]

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
    { label: '성공',          value: `${successCount}건`,  accent: successCount > 0 ? 'text-positive' : '' },
    { label: '부분',          value: `${partialCount}건`,  accent: partialCount > 0 ? 'text-yellow-600' : '' },
    { label: '실패',          value: `${failedCount}건`,   accent: failedCount > 0 ? 'text-negative font-semibold' : '' },
    { label: '신규 적재(합)', value: `${totalInserted.toLocaleString()}건` },
  ]

  return (
    <>
      {/* 헤더 */}
      <AdminPageHeader />

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

      {/* 로그 표 (클라이언트 컴포넌트 — 드릴다운·소스 대구분 배지) */}
      <CrawlLogsTable logs={logs} />
    </>
  )
}
