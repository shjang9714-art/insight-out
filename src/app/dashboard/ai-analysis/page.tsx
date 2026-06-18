import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import AiInsightsView from '@/components/analysis/AiInsightsView'

export const metadata: Metadata = {
  title: 'AI 분석 | Insight Out',
  description: '시장 신호·이슈·인사이트를 한눈에.',
}

export default async function AiAnalysisPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-foreground">AI 분석</h1>
        </div>
        <p className="text-sm text-muted-foreground">시장 신호·이슈·인사이트를 한눈에.</p>
      </div>

      <AiInsightsView />
    </div>
  )
}
