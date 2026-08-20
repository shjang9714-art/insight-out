import type { Metadata } from 'next'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import PublishAnalyticsPanel from '@/components/admin/panels/PublishAnalyticsPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '발행 분석 | 어드민 | Insight Out',
  description: 'AI 리포트·모닝브리핑·뉴스레터·경쟁사 주간 브리핑의 발행 현황을 분석합니다.',
}

export default async function PublishAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  return (
    <div>
      <AdminPageHeader />
      <PublishAnalyticsPanel searchParams={params} />
    </div>
  )
}
