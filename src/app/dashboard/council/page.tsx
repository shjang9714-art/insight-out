import type { Metadata } from 'next'
import { Suspense } from 'react'
import PageContainer from '@/components/PageContainer'
import CouncilWorkspace from '@/components/dashboard/CouncilWorkspace'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 협의체 | Insight Out',
  description:
    'MI(마켓 인텔리전스) 관점의 페르소나로 토론하고 인사이트를 얻는 AI 협의체.',
}

export default function CouncilPage() {
  return (
    <PageContainer>
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        <CouncilWorkspace />
      </Suspense>
    </PageContainer>
  )
}
