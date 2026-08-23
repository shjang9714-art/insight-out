import type { Metadata } from 'next'
import { Suspense } from 'react'
import AiInsightsView from '@/components/analysis/AiInsightsView'
import ContentsL2Tabs from '@/components/nav/ContentsL2Tabs'
import PageContainer from '@/components/PageContainer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 인사이트 | Insight Out',
  description: 'AI가 분석한 시장 인사이트 · 이슈 · 뜨는 토픽을 한눈에.',
}

type SearchParams = Promise<{ view?: string; week?: string }>

const PUBLIC_VIEWS = ['brief', 'graph', 'keyword'] as const
const ADMIN_VIEWS = ['headline', 'trending', 'issues'] as const
const VALID_VIEWS = [...PUBLIC_VIEWS, ...ADMIN_VIEWS] as const
type ViewId = typeof VALID_VIEWS[number]

export default async function IssuesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: ViewId = (VALID_VIEWS.includes(raw as ViewId) ? raw : 'brief') as ViewId

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <ContentsL2Tabs />
      </Suspense>
      <Suspense fallback={
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      }>
        <AiInsightsView
          view={view}
          week={params.week}
        />
      </Suspense>
    </PageContainer>
  )
}
