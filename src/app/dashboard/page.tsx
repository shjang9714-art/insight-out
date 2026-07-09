import { Suspense, type ReactNode } from 'react'
import FeedSlot from '@/components/feed/FeedSlot'
import IssueSignals from '@/components/dashboard/IssueSignals'
import KeyInsightHomeHighlights from '@/components/dashboard/KeyInsightHomeHighlights'
import VisitDelta from '@/components/dashboard/VisitDelta'
import PersonalizationNudge from '@/components/dashboard/PersonalizationNudge'
import PageContainer from '@/components/PageContainer'
import { getHomeSectionLayout } from '@/lib/home/layout'

/** FeedSlot 카드 그리드 레이아웃에 맞춘 중립 스켈레톤(dashboard/loading.tsx 톤 재사용, 마젠타 없음). */
function FeedSlotSkeleton() {
  return (
    <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="aspect-[16/9] bg-muted animate-pulse" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 섹션 key → 렌더러. 각 섹션의 기존 Suspense·레이아웃 그대로 캡슐화. */
const SECTION_RENDERERS: Record<string, () => ReactNode> = {
  personalization_nudge: () => (
    <Suspense fallback={null}>
      <PersonalizationNudge />
    </Suspense>
  ),
  visit_delta: () => (
    <Suspense fallback={null}>
      <VisitDelta />
    </Suspense>
  ),
  issue_signals: () => (
    <Suspense fallback={null}>
      <IssueSignals />
    </Suspense>
  ),
  briefing_highlights: () => (
    <Suspense fallback={null}>
      <KeyInsightHomeHighlights />
    </Suspense>
  ),
  feed_slot: () => (
    <section>
      <Suspense fallback={<FeedSlotSkeleton />}>
        <FeedSlot />
      </Suspense>
    </section>
  ),
}

export default async function DashboardPage() {
  const layout = await getHomeSectionLayout()

  return (
    <PageContainer>
      <div className="space-y-8">
        {layout
          .filter((section) => section.enabled)
          .map((section) => {
            const render = SECTION_RENDERERS[section.key]
            return render ? <div key={section.key}>{render()}</div> : null
          })}
      </div>
    </PageContainer>
  )
}
