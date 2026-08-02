'use client'

import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { JOB_RUN_STATUS_LABEL, JOB_RUN_STATUS_TONE } from '@/lib/admin/status-style'
import { useAdminTable } from '@/lib/admin/use-admin-table'

type JobRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped'

export interface JobRunRow {
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

const formatKST = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
const formatCount = (value: number | null) => value === null ? '—' : value.toLocaleString()

const columns: AdminTableColumn<JobRunRow>[] = [
  { key: 'started_at', header: '시작 시각', sortKey: 'started_at', nowrap: true, cell: (run) => <span className="text-xs text-muted-foreground">{formatKST(run.started_at)}</span> },
  { key: 'job_key', header: '잡', sortKey: 'job_key', cell: (run) => <span className="font-medium text-foreground">{run.job_key}{run.mode && <span className="ml-1 text-xs text-muted-foreground">({run.mode})</span>}</span> },
  { key: 'trigger', header: '트리거', cell: (run) => <span className="text-xs text-muted-foreground">{run.trigger}</span> },
  { key: 'status', header: '상태', sortKey: 'status', cell: (run) => <StatusBadge tone={JOB_RUN_STATUS_TONE[run.status]} label={JOB_RUN_STATUS_LABEL[run.status]} /> },
  { key: 'duration', header: '소요', sortKey: 'duration_ms', nowrap: true, cell: (run) => <span className="text-xs text-muted-foreground">{run.duration_ms === null ? '—' : `${run.duration_ms.toLocaleString()}ms`}</span> },
  { key: 'counts', header: '처리/설정/스킵/남음', nowrap: true, cell: (run) => <span className="text-xs text-muted-foreground">{formatCount(run.processed)} / {formatCount(run.filled)} / {formatCount(run.skipped_count)} / {formatCount(run.remaining)}</span> },
  { key: 'error', header: '오류', truncate: true, width: 'max-w-xs', cell: (run) => <span className="text-xs text-negative" title={run.error ?? undefined}>{run.error ?? '—'}</span> },
]

interface Props {
  rows: JobRunRow[]
  state: AdminTableState
  errorMessage?: string
  page: number
  pageSize: number
  total: number | null
  sort: { key: string; dir: 'asc' | 'desc' }
}

export default function JobRunsTable({ rows, state, errorMessage, page, pageSize, total, sort }: Props) {
  const table = useAdminTable({ defaultSort: sort, pageSize })
  return (
    <AdminTable
      columns={columns}
      rows={rows}
      rowKey={(run) => run.id}
      state={state}
      emptyMessage="조건에 맞는 작업 실행 기록이 없습니다."
      errorMessage={errorMessage}
      onRetry={() => window.location.reload()}
      sort={table.sort}
      onSortChange={table.toggleSort}
      pagination={{ page, pageSize, total }}
      onPageChange={table.setPage}
      minWidth="min-w-[900px]"
    />
  )
}
