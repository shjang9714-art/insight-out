import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import OpsIssueManager, { type Admin, type Issue } from '@/components/admin/OpsIssueManager'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '운영 이슈 | 어드민 | Insight Out', description: '자동 탐지된 운영 이슈를 확인하고 처리합니다.' }

const PAGE_SIZE = 20
const STATUS_FILTERS = [{ value: 'open', label: '미해결' }, { value: 'resolved', label: '해결' }]
const SEVERITY_FILTERS = [{ value: '', label: '모든 심각도' }, { value: 'critical', label: '긴급' }, { value: 'warning', label: '주의' }, { value: 'notice', label: '알림' }]

interface PageProps { searchParams: Promise<{ status?: string; severity?: string; page?: string }> }

function buildHref(status: string, severity: string): string {
  const params = new URLSearchParams({ status, page: '1' })
  if (severity) params.set('severity', severity)
  return `/admin/ops-issues?${params.toString()}`
}

export default async function OpsIssuesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = params.status === 'resolved' ? 'resolved' : 'open'
  const severity = SEVERITY_FILTERS.some((filter) => filter.value === params.severity) ? (params.severity ?? '') : ''
  const parsedPage = Number.parseInt(params.page ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const admin = createAdminClient()
  let issuesQuery = admin
    .from('ops_issues')
    .select('id, fingerprint, category, severity, status, title, suspected_cause, recommended_action, impact, occurrence_count, first_seen_at, last_seen_at, assignee, resolution_note, related_url, resolved_at', { count: 'exact' })
    .order('last_seen_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  issuesQuery = status === 'resolved' ? issuesQuery.eq('status', 'resolved') : issuesQuery.neq('status', 'resolved')
  if (severity) issuesQuery = issuesQuery.eq('severity', severity)

  const [{ data: issues, error, count }, { data: admins }] = await Promise.all([
    issuesQuery,
    admin.from('users').select('id, name, email').eq('role', 'admin').order('name'),
  ])

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => <Link key={filter.value} href={buildHref(filter.value, severity)} prefetch={false} className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors', status === filter.value ? 'border-brand-600 bg-brand-600/10 text-brand-600' : 'border-border text-muted-foreground hover:text-foreground')}>{filter.label}</Link>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_FILTERS.map((filter) => <Link key={filter.value} href={buildHref(status, filter.value)} prefetch={false} className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors', severity === filter.value ? 'border-brand-600 bg-brand-600/10 text-brand-600' : 'border-border text-muted-foreground hover:text-foreground')}>{filter.label}</Link>)}
        </div>
      </div>
      <OpsIssueManager
        key={`${status}-${severity}-${page}`}
        initialIssues={(issues ?? []) as Issue[]}
        admins={(admins ?? []) as Admin[]}
        state={error ? 'error' : (issues ?? []).length === 0 ? 'empty' : 'idle'}
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
      />
    </main>
  )
}
