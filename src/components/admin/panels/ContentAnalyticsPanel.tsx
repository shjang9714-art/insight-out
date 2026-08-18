import { createAdminClient } from '@/lib/supabase/admin'
import { gatherContentAnalytics } from '@/lib/admin/analytics'
import ContentAnalyticsView from '@/components/admin/ContentAnalyticsView'

const VALID_DAYS = [7, 30, 90] as const

function parseDays(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return (VALID_DAYS as readonly number[]).includes(n) ? n : 30
}

interface ContentAnalyticsPanelProps {
  searchParams: Record<string, string | string[] | undefined>
}

/** 524 — analytics/content/page.tsx 에서 이식. 데이터 로딩 로직 불변, AdminPageHeader 만 제거(허브가 대신 렌더). */
export default async function ContentAnalyticsPanel({ searchParams }: ContentAnalyticsPanelProps) {
  const windowDays = parseDays(searchParams.days)
  const admin = createAdminClient()
  const data = await gatherContentAnalytics(admin, windowDays)

  return <ContentAnalyticsView data={data} />
}
