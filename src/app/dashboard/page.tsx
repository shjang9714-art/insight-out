'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import RecentFeed from '@/components/dashboard/RecentFeed'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import EmailArchiveWidget from '@/components/dashboard/EmailArchiveWidget'

function DashboardContent() {
  const searchParams  = useSearchParams()
  const activeService = searchParams.get('service') ?? 'all'

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      {/* 아카이빙 콘텐츠 메일 발송 */}
      <EmailArchiveWidget />

      {/* 최근 피드 → 그 아래 경쟁사 동향 */}
      <RecentFeed activeService={activeService} />
      <CompetitorTrends />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">로딩 중...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
