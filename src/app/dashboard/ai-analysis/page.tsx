import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import AnalysisTabs from '@/components/analysis/AnalysisTabs'
import AiInsightsView from '@/components/analysis/AiInsightsView'
import IssueBoardView from '@/components/issues/IssueBoardView'
import EntityBrowseView from '@/components/entities/EntityBrowseView'

export const metadata: Metadata = {
  title: 'AI 분석 | Insight Out',
  description: 'AI 인사이트·이슈·지식그래프를 통합합니다.',
}

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

const VALID_TABS = ['insights', 'issues', 'entities'] as const
type TabId = typeof VALID_TABS[number]

export default async function AiAnalysisPage({ searchParams }: PageProps) {
  const { tab } = await searchParams
  const activeTab: TabId = VALID_TABS.includes(tab as TabId) ? (tab as TabId) : 'insights'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground">AI 분석</h1>
        </div>
        <p className="text-sm text-muted-foreground">AI 인사이트·이슈·지식그래프를 통합합니다.</p>
      </div>

      {/* 탭바 */}
      <AnalysisTabs activeTab={activeTab} />

      {/* 탭 콘텐츠 */}
      {activeTab === 'insights'  && <AiInsightsView />}
      {activeTab === 'issues'    && <IssueBoardView />}
      {activeTab === 'entities'  && <EntityBrowseView />}
    </div>
  )
}
