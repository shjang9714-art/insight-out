import type { Metadata } from 'next'
import { Suspense } from 'react'
import ReportsHub from '@/components/admin/ReportsHub'

export const metadata: Metadata = {
  title: '전략보고서 관리 | 어드민 | Insight Out',
  description: '전략보고서 생성·재생성·표지·발행자/발행일 HITL 발행 워크플로우를 관리합니다.',
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsHub />
    </Suspense>
  )
}
