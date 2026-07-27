'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

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
}

export default function NewsletterHistory({ initialIssues }: Props) {
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

  return (
    <div>
      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 발송 이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">발송일</th>
                <th className="pb-2 text-left font-medium">제목</th>
                <th className="pb-2 text-center font-medium">수신자</th>
                <th className="pb-2 text-center font-medium">상태</th>
                <th className="pb-2 text-center font-medium">트리거</th>
                <th className="pb-2 text-center font-medium">오픈율</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <>
                  <tr
                    key={issue.id}
                    onClick={() => handleSelectIssue(issue.id)}
                    className="cursor-pointer border-b border-border hover:bg-accent/50 transition-colors"
                  >
                    <td className="py-3 text-foreground">{issue.sent_on}</td>
                    <td className="py-3 text-foreground max-w-xs truncate">{issue.subject}</td>
                    <td className="py-3 text-center text-muted-foreground">{issue.recipient_cnt}</td>
                    <td className="py-3 text-center">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        issue.status === 'sent' ? 'bg-positive-soft text-positive' :
                        issue.status === 'partial' ? 'bg-risk-soft text-risk' :
                        issue.status === 'failed' ? 'bg-negative-soft text-negative' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {issue.status}
                      </span>
                    </td>
                    <td className="py-3 text-center text-muted-foreground text-xs">{issue.triggered_by}</td>
                    <td className="py-3 text-center text-muted-foreground text-xs">
                      {selectedIssueId === issue.id
                        ? recipientsLoading ? '...' : openRate(issue.id) ?? '-'
                        : '클릭해서 확인'}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
