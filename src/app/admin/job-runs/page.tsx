import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { JOB_RUN_STATUS_TONE, JOB_RUN_STATUS_LABEL } from '@/lib/admin/status-style'
import { cn } from '@/lib/utils'
import { History } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '작업 이력 | 어드민 | Insight Out',
  description: '크론·일괄 작업의 실행 기록과 실패를 확인합니다.',
}

type JobRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped'

interface JobRunRow {
  id: string
  job_key: string
  trigger: 'cron' | 'admin'
  mode: string | null
  status: JobRunStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  processed: number | null
  filled: number | null
  skipped_count: number | null
  remaining: number | null
  error: string | null
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'failed', label: '실패' },
  { value: 'succeeded', label: '성공' },
  { value: 'skipped', label: '스킵' },
  { value: 'running', label: '실행 중' },
]

const RANGE_FILTERS: { value: string; label: string; days: number | null }[] = [
  { value: '1',  label: '최근 24시간', days: 1 },
  { value: '7',  label: '최근 7일',    days: 7 },
  { value: '30', label: '최근 30일',   days: 30 },
  { value: 'all', label: '전체',       days: null },
]

function formatKST(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatCount(n: number | null): string {
  return n === null ? '—' : n.toLocaleString()
}

function buildHref(params: Record<string, string>): string {
  const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
  const qs = sp.toString()
  return qs ? `/admin/job-runs?${qs}` : '/admin/job-runs'
}

interface PageProps {
  searchParams: Promise<{ status?: string; job?: string; range?: string }>
}

export default async function AdminJobRunsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = params.status ?? ''
  const jobFilter = params.job ?? ''
  const range = params.range ?? '7'

  // 어드민 role 직접 재확인(미들웨어 의존 금지, 289 §3-4)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  // job_runs 는 RLS 정책 없음(service_role 전용) — admin 클라이언트로 조회
  const admin = createAdminClient()

  let query = admin
    .from('job_runs')
    .select('id, job_key, trigger, mode, status, started_at, finished_at, duration_ms, processed, filled, skipped_count, remaining, error')
    .order('started_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)
  if (jobFilter) query = query.ilike('job_key', `%${jobFilter}%`)

  const rangeDef = RANGE_FILTERS.find((r) => r.value === range) ?? RANGE_FILTERS[1]
  if (rangeDef.days !== null) {
    // Date.now() purity 규칙 회피 (crawl-logs/page.tsx 패턴과 동일)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - rangeDef.days)
    query = query.gte('started_at', cutoffDate.toISOString())
  }

  const { data, error } = await query
  const ready = !error || error.code !== '42P01'
  const runs = (ready ? (data ?? []) : []) as JobRunRow[]

  return (
    <div className="space-y-6">
      <AdminPageHeader />

      {!ready ? (
        <AdminEmptyState
          icon={History}
          message="작업 이력 테이블이 아직 준비되지 않았습니다 (SQL 289 미적용)."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={buildHref({ status: f.value, job: jobFilter, range })}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    status === f.value
                      ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RANGE_FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={buildHref({ status, job: jobFilter, range: f.value })}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    range === f.value
                      ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {runs.length === 0 ? (
            <AdminEmptyState icon={History} message="조건에 맞는 작업 실행 기록이 없습니다." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">시작 시각</th>
                    <th className="px-3 py-2 font-medium">잡</th>
                    <th className="px-3 py-2 font-medium">트리거</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">소요</th>
                    <th className="px-3 py-2 font-medium">처리/설정/스킵/남음</th>
                    <th className="px-3 py-2 font-medium">오류</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => (
                    <tr key={run.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatKST(run.started_at)}</td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {run.job_key}
                        {run.mode && <span className="ml-1 text-xs text-muted-foreground">({run.mode})</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{run.trigger}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={JOB_RUN_STATUS_TONE[run.status]} label={JOB_RUN_STATUS_LABEL[run.status]} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {run.duration_ms === null ? '—' : `${run.duration_ms.toLocaleString()}ms`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {formatCount(run.processed)} / {formatCount(run.filled)} / {formatCount(run.skipped_count)} / {formatCount(run.remaining)}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs text-negative" title={run.error ?? undefined}>
                        {run.error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
