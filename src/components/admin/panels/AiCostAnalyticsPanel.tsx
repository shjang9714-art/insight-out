import { createAdminClient } from '@/lib/supabase/admin'
import { gatherAiCostAnalytics } from '@/lib/admin/analytics'
import AiCostAnalyticsView from '@/components/admin/AiCostAnalyticsView'

function parseMonths(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 6
}

interface AiCostAnalyticsPanelProps {
  searchParams: Record<string, string | string[] | undefined>
}

/** 524 — analytics/ai-cost/page.tsx 에서 이식. 데이터 로딩 로직 불변, AdminPageHeader 만 제거(허브가 대신 렌더). */
export default async function AiCostAnalyticsPanel({ searchParams }: AiCostAnalyticsPanelProps) {
  const months = parseMonths(searchParams.months)
  const admin = createAdminClient()
  const data = await gatherAiCostAnalytics(admin, months)

  return <AiCostAnalyticsView data={data} months={months} />
}
