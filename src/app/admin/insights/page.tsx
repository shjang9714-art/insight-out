import type { Metadata } from 'next'
import InsightCardsManager from '@/components/admin/InsightCardsManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '기업 주간 시사점 | 어드민 | Insight Out',
  description: '기업 주간 시사점 카드를 생성·검수·편집·발행합니다.',
}

export default function AdminInsightsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <p className="text-sm text-muted-foreground">
        여기서 발행한 카드가 서비스 기업동향의 &apos;LG U+ 시사점&apos;입니다.
      </p>
      <InsightCardsManager />
    </div>
  )
}
