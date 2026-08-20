import type { Metadata } from 'next'
import { Suspense } from 'react'
import SystemSettingsHub from '@/components/admin/SystemSettingsHub'
import AiCostAnalyticsPanel from '@/components/admin/panels/AiCostAnalyticsPanel'

export const metadata: Metadata = {
  title: '시스템 설정 | 어드민 | Insight Out',
  description: '어드민 콘솔 화면 테마·폰트·색상 설정',
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab

  return (
    <Suspense fallback={null}>
      <SystemSettingsHub
        llmCostPanel={rawTab === 'llm' ? <AiCostAnalyticsPanel searchParams={params} /> : null}
      />
    </Suspense>
  )
}
