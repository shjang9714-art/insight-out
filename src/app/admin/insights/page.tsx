import type { Metadata } from 'next'
import InsightCardsManager from '@/components/admin/InsightCardsManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '인사이트 카드 | 어드민 | Insight Out',
  description: 'AI 인사이트 카드를 생성·검수·발행합니다.',
}

export default function AdminInsightsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <InsightCardsManager />
    </div>
  )
}
