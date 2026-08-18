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

/** 524 — analytics/publish/page.tsx 에서 이식. 데이터 로딩 로직 불변, AdminPageHeader 만 제거(허브가 대신 렌더). */
export default async function PublishAnalyticsPanel({ searchParams }: PublishAnalyticsPanelProps) {
  const months = parseMonths(searchParams.months)
  const admin = createAdminClient()
  const data = await gatherPublishAnalytics(admin, months)

  return <PublishAnalyticsView data={data} months={months} />
}
