'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mic } from 'lucide-react'
import RecentFeed from '@/components/dashboard/RecentFeed'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import EmailArchiveWidget from '@/components/dashboard/EmailArchiveWidget'
import { SAVED_KEYWORDS } from '@/components/dashboard/mock-data/taxonomy'

function TrendingKeywords() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">🔥</span>
        <h3 className="text-sm font-semibold text-foreground">트렌딩 키워드</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {SAVED_KEYWORDS.map((kw) => (
          <span
            key={kw}
            className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  )
}

function BriefingPlaceholder() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">🎙</span>
        <h3 className="text-sm font-semibold text-foreground">오늘의 브리핑</h3>
      </div>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Mic className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">곧 제공됩니다</p>
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          Coming Soon
        </span>
      </div>
    </div>
  )
}

function DashboardContent() {
  const searchParams  = useSearchParams()
  // 전역 svc 파라미터(UUID). 없으면 'all'
  const activeService = searchParams.get('svc') ?? 'all'

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* 3단 그리드: xl = 피드 + 우측 레일, 그 아래 = 단일 컬럼 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* 중앙: 아카이빙 위젯 + 최근 피드 */}
        <div className="min-w-0 space-y-6">
          <EmailArchiveWidget />
          <RecentFeed activeService={activeService} />
        </div>

        {/* 우측 레일: xl+ 에서 사이드, 그 아래에서 피드 아래 스택 */}
        <aside className="flex flex-col gap-4">
          <BriefingPlaceholder />
          <CompetitorTrends />
          <TrendingKeywords />
        </aside>
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
