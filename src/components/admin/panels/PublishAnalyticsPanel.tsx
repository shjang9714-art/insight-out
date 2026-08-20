import { createAdminClient } from '@/lib/supabase/admin'
import { gatherPublishAnalytics } from '@/lib/admin/analytics'
import PublishAnalyticsView from '@/components/admin/PublishAnalyticsView'

function parseMonths(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 6
}

interface PublishAnalyticsPanelProps {
  searchParams: Record<string, string | string[] | undefined>
}

/** 발행 분석 페이지의 서버 조회 패널. 페이지 헤더는 상위 페이지가 렌더한다. */
export default async function PublishAnalyticsPanel({ searchParams }: PublishAnalyticsPanelProps) {
  const months = parseMonths(searchParams.months)
  const admin = createAdminClient()
  const data = await gatherPublishAnalytics(admin, months)

  return <PublishAnalyticsView data={data} months={months} />
}
