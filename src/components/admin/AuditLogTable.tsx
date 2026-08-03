'use client'

import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import { cn } from '@/lib/utils'

export interface AuditLogRow {
  id: number
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  target_count: number | null
  outcome: 'started' | 'ok' | 'failed'
  created_at: string
}

const columns: AdminTableColumn<AuditLogRow>[] = [
  { key: 'created_at', header: '시각', nowrap: true, cell: (row) => new Date(row.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) },
  { key: 'actor', header: '관리자', truncate: true, cell: (row) => row.actor_email ?? '삭제된 사용자' },
  { key: 'action', header: '행위', truncate: true, cell: (row) => row.action },
  { key: 'target', header: '대상', truncate: true, cell: (row) => [row.target_type, row.target_id].filter(Boolean).join(' · ') || '-' },
  { key: 'count', header: '건수', numeric: true, cell: (row) => row.target_count ?? '-' },
  { key: 'outcome', header: '결과', cell: (row) => (
    <span className={cn('rounded px-2 py-1 text-xs font-medium', row.outcome === 'ok' && 'bg-success-soft text-success', row.outcome === 'failed' && 'bg-risk-soft text-risk', row.outcome === 'started' && 'bg-warning-soft text-warning')}>
      {row.outcome === 'ok' ? '완료' : row.outcome === 'failed' ? '실패' : '미완료'}
    </span>
  ) },
]

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  return <AdminTable columns={columns} rows={rows} rowKey={(row) => String(row.id)} state={rows.length === 0 ? 'empty' : 'idle'} emptyMessage="감사 기록이 없습니다." truncated={rows.length === 100 ? { shown: 100, total: null } : undefined} rowClassName={(row) => row.outcome === 'started' ? 'bg-warning-soft/40' : ''} />
}
