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

/** 시스템 설정의 AI 모델 탭이 활성일 때만 생성하는 서버 조회 패널. */
export default async function AiCostAnalyticsPanel({ searchParams }: AiCostAnalyticsPanelProps) {
  const months = parseMonths(searchParams.months)
  const admin = createAdminClient()
  const data = await gatherAiCostAnalytics(admin, months)

  return <AiCostAnalyticsView data={data} months={months} />
}
