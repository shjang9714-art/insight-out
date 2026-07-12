import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export interface FailedJobRow {
  id: string
  job_key: string
  error: string | null
  started_at: string
}

interface Props {
  jobs: FailedJobRow[]
  /** false = job_runs 테이블 미적용(42P01) — 카드 자체를 숨긴다(289). */
  ready: boolean
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 최근 24시간 내 실패한 작업(job_runs, 289) — 있으면 눈에 띄게, 없으면 조용히.
 * job_runs 미적용(42P01) 시 카드 자체를 렌더하지 않는다(graceful).
 */
export default function AdminFailedJobsCard({ jobs, ready }: Props) {
  if (!ready) return null

  if (jobs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-positive">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        최근 24시간 내 실패한 작업이 없습니다.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-negative/30 bg-negative-soft p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-negative" />
          <h2 className="admin-section-title text-negative">최근 실패한 작업 ({jobs.length}건)</h2>
        </div>
        <Link
          href="/admin/job-runs?status=failed"
          className="text-xs font-medium text-negative underline underline-offset-2 hover:opacity-80"
        >
          전체 보기 →
        </Link>
      </div>
      <ul className="space-y-2">
        {jobs.slice(0, 5).map((job) => (
          <li key={job.id} className="flex items-start justify-between gap-3 rounded-lg bg-card/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{job.job_key}</p>
              {job.error && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={job.error}>{job.error}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{formatTime(job.started_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
