import type { Metadata } from 'next'
import { Suspense } from 'react'
import InsightHub from '@/components/admin/InsightHub'

export const metadata: Metadata = {
  title: '핵심인사이트 | 어드민 | Insight Out',
  description: '인사이트 카드·이슈·일일 핵심을 생성·검수·발행합니다.',
}

export default function AdminInsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightHub />
    </Suspense>
  )
}
