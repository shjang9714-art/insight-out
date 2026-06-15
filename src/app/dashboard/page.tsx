'use client'

import { Suspense } from 'react'
import RecentFeed from '@/components/dashboard/RecentFeed'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import KATrends from '@/components/dashboard/KATrends'

function DashboardContent() {
  return (
    <div className="px-4 py-6 sm:px-5">
      <div className="space-y-8">
        {/* 1블록: 최근 피드 (태그 매칭 우선 정렬) */}
        <section>
          <RecentFeed />
        </section>

        {/* 2블록: 경쟁사 동향 */}
        <section>
          <CompetitorTrends />
        </section>

        {/* 3블록: KA 동향 */}
        <section>
          <KATrends />
        </section>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
