import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'

export interface OpsIssueSummaryRow {
  id: string
  severity: 'critical' | 'warning' | 'notice'
  title: string
  suspected_cause: string | null
  occurrence_count: number
  last_seen_at: string
}

interface Props {
  issues: OpsIssueSummaryRow[]
  error: string | null
}

const SEVERITY_LABEL = {
  critical: '긴급',
  warning: '주의',
  notice: '알림',
} as const

function formatKst(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminOpsIssuesSummary({ issues, error }: Props) {
  return (
    <section aria-label="미해결 운영 이슈">
      <AdminSectionHeader
        icon={AlertTriangle}
        title="미해결 운영 이슈"
        hint="자동 탐지된 최근 운영 이슈"
        action={(
          <Link href="/admin/ops-issues" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            전체 보기 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      />

      {error ? (
        <AdminEmptyState
          message="운영 이슈를 불러오지 못했습니다."
          hint={error}
        />
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          미해결 운영 이슈 없음
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {issues.map((issue) => (
            <li key={issue.id} className="grid gap-2 px-5 py-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
              <Badge variant={issue.severity === 'critical' ? 'destructive' : 'secondary'}>
                {SEVERITY_LABEL[issue.severity]}
              </Badge>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{issue.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {issue.suspected_cause ?? '원인 미상'}
                </p>
              </div>
              <div className="text-xs text-muted-foreground lg:text-right">
                <p>발생 {issue.occurrence_count.toLocaleString()}회</p>
                <p className="mt-1">{formatKst(issue.last_seen_at)} KST</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
