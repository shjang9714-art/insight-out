import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherPublishAnalytics } from '@/lib/admin/analytics'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import PublishAnalyticsView from '@/components/admin/PublishAnalyticsView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '발행 분석 | 어드민 | Insight Out',
  description: '전략보고서·모닝브리핑·뉴스레터·경쟁사 주간 발행량·성공률·검수 리드타임을 확인합니다.',
}

function parseMonths(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 6
}

export default async function PublishAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const months = parseMonths(params.months)
  const admin = createAdminClient()
  const data = await gatherPublishAnalytics(admin, months)

  return (
    <>
      <AdminPageHeader />
      <PublishAnalyticsView data={data} months={months} />
    </>
  )
}
