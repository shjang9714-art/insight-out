import type { Metadata } from 'next'
import { Suspense } from 'react'
import AnalyticsHub from '@/components/admin/AnalyticsHub'
import ContentAnalyticsPanel from '@/components/admin/panels/ContentAnalyticsPanel'
import PublishAnalyticsPanel from '@/components/admin/panels/PublishAnalyticsPanel'
import AiCostAnalyticsPanel from '@/components/admin/panels/AiCostAnalyticsPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '통계분석 | 어드민 | Insight Out',
  description: '콘텐츠·수집·발행 분석과 AI 사용량·비용을 통합 조회합니다.',
}

type AnalyticsTab = 'content' | 'source-quality' | 'publish' | 'ai-cost'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// 524 — analytics/content · source-quality · analytics/publish · analytics/ai-cost 통합
// (AdminTabShell 이식). href 는 /admin/analytics/content 로 고정, 나머지 세 경로는 리다이렉트
// 스텁으로 남는다(딥링크 보존). service_role 전용 서버 조회 3건은 활성 탭일 때만 렌더한다.
export default async function AnalyticsContentPage({ searchParams }: PageProps) {
  const params = await searchParams
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const tab: AnalyticsTab =
    rawTab === 'source-quality' || rawTab === 'publish' || rawTab === 'ai-cost' ? rawTab : 'content'

  return (
    <Suspense fallback={null}>
      <AnalyticsHub
        contentPanel={tab === 'content' ? <ContentAnalyticsPanel searchParams={params} /> : null}
        publishPanel={tab === 'publish' ? <PublishAnalyticsPanel searchParams={params} /> : null}
        aiCostPanel={tab === 'ai-cost' ? <AiCostAnalyticsPanel searchParams={params} /> : null}
      />
    </Suspense>
  )
}
