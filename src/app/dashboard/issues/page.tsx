import type { Metadata } from 'next'
import { Suspense } from 'react'
import AiInsightsView from '@/components/analysis/AiInsightsView'
import ScopeFilter from '@/components/analysis/ScopeFilter'
import PageContainer from '@/components/PageContainer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 인사이트 | Insight Out',
  description: 'AI가 분석한 시장 인사이트 · 이슈 · 뜨는 토픽을 한눈에.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS = ['briefing', 'issues'] as const
type ViewId = typeof VALID_VIEWS[number]

export default async function IssuesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: ViewId = (VALID_VIEWS.includes(raw as ViewId) ? raw : 'briefing') as ViewId

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">AI 인사이트</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">AI가 분석한 시장 신호·이슈·인사이트를 한눈에.</p>
      </div>
      <div className="mb-6">
        <Suspense fallback={null}>
          <ScopeFilter />
        </Suspense>
      </div>
      <Suspense fallback={
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      }>
        <AiInsightsView view={view} />
      </Suspense>
    </PageContainer>
  )
}
