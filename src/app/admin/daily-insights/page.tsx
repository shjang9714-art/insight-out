import type { Metadata } from 'next'
import DailyInsightsManager from '@/components/admin/DailyInsightsManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '일일 핵심 Insight 검토 | 어드민 | Insight Out',
  description: '자동 게시된 일일 핵심 Insight를 사후 검토·편집·반려합니다.',
}

export default function AdminDailyInsightsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <DailyInsightsManager />
    </div>
  )
}
