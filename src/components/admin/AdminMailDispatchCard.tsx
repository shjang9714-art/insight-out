import Link from 'next/link'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MailRunRow {
  job_key: string
  status: string
  started_at: string
  duration_ms: number | null
  meta: Record<string, unknown> | null
}

interface Props {
  rows: MailRunRow[]
  /** false = job_runs 테이블 미적용(42P01) — 카드 자체를 숨긴다. */
  ready: boolean
}

const CRON_ORDER = ['cron:ops-brief', 'cron:ops-weekly', 'cron:ops-alert'] as const
const CRON_LABEL: Record<string, string> = {
  'cron:ops-brief': '일일 운영 브리핑',
  'cron:ops-weekly': '주간 운영 리포트',
  'cron:ops-alert': '긴급 즉시 알림',
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

function statusBadge(status: string, meta: Record<string, unknown> | null) {
  if (status === 'succeeded') {
    return <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive">발송</span>
  }
  if (status === 'skipped') {
    const reason = typeof meta?.reason === 'string' ? meta.reason : null
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        건너뜀{reason ? ` · ${reason}` : ''}
      </span>
    )
  }
  if (status === 'failed') {
    return <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-medium text-negative">실패</span>
  }
  if (status === 'running') {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">진행 중</span>
  }
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{status}</span>
}

function countLabel(meta: Record<string, unknown> | null): string | null {
  if (!meta || typeof meta !== 'object') return null
  if (typeof meta.sent === 'number') return `${meta.sent.toLocaleString()}명 발송`
  if (typeof meta.alerted === 'number') return `${meta.alerted.toLocaleString()}건 알림`
  return null
}

function subjectLabel(meta: Record<string, unknown> | null): string | null {
  if (!meta || typeof meta !== 'object') return null
  return typeof meta.subject === 'string' ? meta.subject : null
}

export default function AdminMailDispatchCard({ rows, ready }: Props) {
  if (!ready) return null

  const latestByKey = new Map<string, MailRunRow>()
  for (const row of rows) {
    if (!latestByKey.has(row.job_key)) latestByKey.set(row.job_key, row)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
          <h2 className="admin-section-title text-foreground">메일 발송 이력</h2>
        </div>
        <Link
          href="/admin/job-runs"
          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          전체 보기 →
        </Link>
      </div>
      <ul className="space-y-2">
        {CRON_ORDER.map((jobKey) => {
          const row = latestByKey.get(jobKey)
          const count = row ? countLabel(row.meta) : null
          const subject = row ? subjectLabel(row.meta) : null
          return (
            <li key={jobKey} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{CRON_LABEL[jobKey]}</p>
                  {row ? statusBadge(row.status, row.meta) : (
                    <span className={cn('rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground')}>
                      아직 실행 기록 없음
                    </span>
                  )}
                </div>
                {subject && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={subject}>{subject}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {row && <p className="text-xs text-muted-foreground">{formatTime(row.started_at)}</p>}
                {count && <p className="mt-0.5 text-xs font-medium text-foreground">{count}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
