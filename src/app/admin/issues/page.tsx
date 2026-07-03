import type { Metadata } from 'next'
import IssueManager from '@/components/admin/IssueManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '이슈 관리 | 어드민 | Insight Out',
  description: '이슈 생성·발행·match_keywords·콘텐츠 배정 관리',
}

export default function AdminIssuesPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <IssueManager />
    </div>
  )
}
