import { Suspense } from 'react'
import FeedSlot from '@/components/feed/FeedSlot'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import KATrends from '@/components/dashboard/KATrends'

export default function DashboardPage() {
  return (
    <div className="px-4 py-6 sm:px-5">
      <div className="space-y-8">
        {/* 1블록: 추천 피드 (신규/스킵/기존 분기 — FeedSlot) */}
        <section>
          <Suspense fallback={<div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">로딩 중...</div>}>
            <FeedSlot />
          </Suspense>
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
