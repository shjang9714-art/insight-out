'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateOpsIssue } from '@/app/admin/ops-issues/actions'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { useAdminTable } from '@/lib/admin/use-admin-table'

export type Issue = { id: string; category: string; severity: 'critical' | 'warning' | 'notice'; status: string; title: string; suspected_cause: string | null; recommended_action: string | null; impact: string | null; occurrence_count: number; first_seen_at: string; last_seen_at: string; assignee: string | null; resolution_note: string | null; related_url: string | null; resolved_at?: string | null }
export type Admin = { id: string; name: string | null; email: string }

const statusLabel: Record<string, string> = { open: '미확인', acknowledged: '확인', in_progress: '처리중', resolved: '해결', ignored: '무시' }
const severityLabel = { critical: '긴급', warning: '주의', notice: '알림' }
const fmt = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

interface Props {
  initialIssues: Issue[]
  admins: Admin[]
  state: AdminTableState
  page: number
  pageSize: number
  total: number | null
}

export default function OpsIssueManager({ initialIssues, admins, state, page, pageSize, total }: Props) {
  const router = useRouter()
  const table = useAdminTable({ defaultSort: { key: 'last_seen_at', dir: 'desc' }, pageSize })
  const [issues, setIssues] = useState(initialIssues)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const save = (issue: Issue, patch: Parameters<typeof updateOpsIssue>[1]) => {
    setError(null)
    startTransition(async () => {
      const result = await updateOpsIssue(issue.id, patch)
      if (!result.ok) {
        setError(result.error ?? '저장에 실패했습니다.')
        return
      }
      setIssues((previous) => previous.map((item) => item.id === issue.id ? { ...item, ...patch, resolved_at: patch.status === 'resolved' ? new Date().toISOString() : patch.status ? null : item.resolved_at } : item))
      if (patch.status) router.refresh()
    })
  }

  const columns: AdminTableColumn<Issue>[] = [
    { key: 'severity', header: '심각도', nowrap: true, cell: (issue) => <Badge variant={issue.severity === 'critical' ? 'destructive' : 'secondary'}>{severityLabel[issue.severity]}</Badge> },
    { key: 'issue', header: '이슈', width: 'min-w-[320px]', cell: (issue) => <div><div className="flex items-center gap-2"><span className="font-semibold text-foreground">{issue.title}</span>{issue.related_url && <a className="text-xs text-brand-600 underline" href={issue.related_url} target="_blank" rel="noreferrer">관련 링크</a>}</div><p className="mt-1 text-xs text-muted-foreground">{issue.suspected_cause ?? '원인 미상'} · 권장: {issue.recommended_action ?? '로그 확인'}</p></div> },
    { key: 'category', header: '분류/발생', nowrap: true, cell: (issue) => <span className="text-xs text-muted-foreground">{issue.category} · {issue.occurrence_count}회</span> },
    { key: 'last_seen_at', header: '최근 감지', nowrap: true, cell: (issue) => <span className="text-xs text-muted-foreground">{fmt(issue.last_seen_at)}</span> },
    { key: 'status', header: '상태', width: 'w-36', cell: (issue) => <Select disabled={pending} value={issue.status} onValueChange={(status) => save(issue, { status: status as Parameters<typeof updateOpsIssue>[1]['status'] })}><SelectTrigger aria-label={`${issue.title} 상태`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select> },
    { key: 'assignee', header: '담당자', width: 'w-40', cell: (issue) => <Select disabled={pending} value={issue.assignee ?? 'none'} onValueChange={(value) => save(issue, { assignee: value === 'none' ? null : value })}><SelectTrigger aria-label={`${issue.title} 담당자`}><SelectValue placeholder="담당자 없음" /></SelectTrigger><SelectContent><SelectItem value="none">담당자 없음</SelectItem>{admins.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name || admin.email}</SelectItem>)}</SelectContent></Select> },
    { key: 'resolution_note', header: '해결 메모', width: 'min-w-[180px]', cell: (issue) => <textarea className="min-h-10 w-full rounded-md border bg-background p-2 text-sm" defaultValue={issue.resolution_note ?? ''} placeholder="해결 메모" onBlur={(event) => { const value = event.currentTarget.value || null; if (value !== issue.resolution_note) save(issue, { resolution_note: value }) }} /> },
  ]

  return (
    <section className="space-y-4">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <AdminTable
        columns={columns}
        rows={issues}
        rowKey={(issue) => issue.id}
        state={state}
        emptyMessage="조건에 맞는 운영 이슈가 없습니다."
        errorMessage="운영 이슈를 불러오지 못했습니다."
        onRetry={() => window.location.reload()}
        pagination={{ page, pageSize, total }}
        onPageChange={table.setPage}
        minWidth="min-w-[1200px]"
      />
    </section>
  )
}
