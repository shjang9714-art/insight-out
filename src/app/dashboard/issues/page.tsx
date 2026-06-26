import type { Metadata } from 'next'
import { Suspense } from 'react'
import AiInsightsView from '@/components/analysis/AiInsightsView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 인사이트 | Insight Out',
  description: 'AI가 분석한 시장 인사이트 · 이슈 · 뜨는 토픽을 한눈에.',
}

export default function IssuesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">AI 인사이트</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">AI가 분석한 시장 신호·이슈·인사이트를 한눈에.</p>
      </div>
      <Suspense fallback={
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      }>
        <AiInsightsView />
      </Suspense>
    </div>
  )
}
