import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherAiCostAnalytics } from '@/lib/admin/analytics'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AiCostAnalyticsView from '@/components/admin/AiCostAnalyticsView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 사용량·비용 | 어드민 | Insight Out',
  description: 'LLM·번역·TTS 월별 사용량과 한도 대비 소진율을 확인합니다.',
}

function parseMonths(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 6
}

export default async function AiCostAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const months = parseMonths(params.months)
  const admin = createAdminClient()
  const data = await gatherAiCostAnalytics(admin, months)

  return (
    <>
      <AdminPageHeader />
      <AiCostAnalyticsView data={data} months={months} />
    </>
  )
}
