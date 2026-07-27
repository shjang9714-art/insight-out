import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import OpsIssueManager from '@/components/admin/OpsIssueManager'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '운영 이슈 | 어드민 | Insight Out', description: '자동 탐지된 운영 이슈를 확인하고 처리합니다.' }

export default async function OpsIssuesPage() {
  const admin = createAdminClient()
  const [{ data: issues }, { data: admins }] = await Promise.all([
    admin.from('ops_issues').select('id, fingerprint, category, severity, status, title, suspected_cause, recommended_action, impact, occurrence_count, first_seen_at, last_seen_at, assignee, resolution_note, related_url, resolved_at').order('last_seen_at', { ascending: false }),
    admin.from('users').select('id, name, email').eq('role', 'admin').order('name'),
  ])
  const rank: Record<string, number> = { critical: 0, warning: 1, notice: 2 }
  const sorted = (issues ?? []).sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><AdminPageHeader /><OpsIssueManager initialIssues={sorted} admins={admins ?? []} /></main>
}
