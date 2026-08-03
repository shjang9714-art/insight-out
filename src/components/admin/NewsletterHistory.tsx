'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'

interface Issue {
  id: string
  sent_on: string
  subject: string
  recipient_cnt: number
  status: string
  triggered_by: string
  created_at: string
}

interface Recipient {
  status: string
}

interface Props {
  initialIssues: Issue[]
  state: AdminTableState
}

export default function NewsletterHistory({ initialIssues, state }: Props) {
  // 400 §1.2 — 발송 후 이력이 갱신되지 않는 기존 결함(setter 없음). 탭화와 무관, 이번엔 고치지 않는다.
  const [issues] = useState<Issue[]>(initialIssues)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [recipientsLoading, setRecipientsLoading] = useState(false)

  const handleSelectIssue = async (issueId: string) => {
    if (selectedIssueId === issueId) {
      setSelectedIssueId(null)
      setRecipients([])
      return
    }
    setSelectedIssueId(issueId)
    setRecipientsLoading(true)

    const res = await fetch(`/api/admin/newsletter-recipients?issueId=${issueId}`)
    if (res.ok) {
      const data = await res.json()
      setRecipients(data)
    }
    setRecipientsLoading(false)
  }

  const openRate = (issueId: string) => {
    if (selectedIssueId !== issueId || recipients.length === 0) return null
    const opened = recipients.filter((r) => r.status === 'opened').length
    return `${opened}/${recipients.length} (${Math.round((opened / recipients.length) * 100)}%)`
  }

  const columns: AdminTableColumn<Issue>[] = [
    { key: 'sent_on', header: '발송일', cell: (issue) => <span className="text-foreground">{issue.sent_on}</span> },
    { key: 'subject', header: '제목', width: 'max-w-xs', truncate: true, cell: (issue) => <span className="text-foreground">{issue.subject}</span> },
    { key: 'recipient_cnt', header: '수신자', align: 'center', cell: (issue) => <span className="text-muted-foreground">{issue.recipient_cnt}</span> },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      cell: (issue) => (
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          issue.status === 'sent' ? 'bg-positive-soft text-positive' :
          issue.status === 'partial' ? 'bg-risk-soft text-risk' :
          issue.status === 'failed' ? 'bg-negative-soft text-negative' :
          'bg-muted text-muted-foreground'
        )}>
          {issue.status}
        </span>
      ),
    },
    { key: 'triggered_by', header: '트리거', align: 'center', cell: (issue) => <span className="text-xs text-muted-foreground">{issue.triggered_by}</span> },
    {
      key: 'open_rate',
      header: '오픈율',
      align: 'center',
      cell: (issue) => (
        <span className="text-xs text-muted-foreground">
          {selectedIssueId === issue.id
            ? recipientsLoading ? '...' : openRate(issue.id) ?? '-'
            : '클릭해서 확인'}
        </span>
      ),
    },
  ]

  return (
    <AdminTable
      columns={columns}
      rows={issues}
      rowKey={(issue) => issue.id}
      state={state}
      emptyMessage="아직 발송 이력이 없습니다."
      errorMessage="발송 이력을 불러오지 못했습니다."
      onRowClick={(issue) => handleSelectIssue(issue.id)}
    />
  )
}
