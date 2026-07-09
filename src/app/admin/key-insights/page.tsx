import type { Metadata } from 'next'
import KeyInsightsManager from '@/components/admin/KeyInsightsManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '핵심 Insight 검수 | 어드민 | Insight Out',
  description: '"주목하세요, 핵심 Insight" 주간 카드 검수·편집·게시를 관리합니다.',
}

export default function AdminKeyInsightsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <KeyInsightsManager />
    </div>
  )
}
