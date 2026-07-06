import { Suspense, type ReactNode } from 'react'
import FeedSlot from '@/components/feed/FeedSlot'
import IssueSignals from '@/components/dashboard/IssueSignals'
import TodayBriefingHighlights from '@/components/dashboard/TodayBriefingHighlights'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import VisitDelta from '@/components/dashboard/VisitDelta'
import PersonalizationNudge from '@/components/dashboard/PersonalizationNudge'
import PageContainer from '@/components/PageContainer'
import { getHomeSectionLayout } from '@/lib/home/layout'

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
  suggested_questions: () => <SuggestedQuestions />,
  issue_signals: () => (
    <Suspense fallback={null}>
      <IssueSignals />
    </Suspense>
  ),
  briefing_highlights: () => (
    <Suspense fallback={null}>
      <TodayBriefingHighlights />
    </Suspense>
  ),
  feed_slot: () => (
    <section>
      <Suspense fallback={<div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">로딩 중...</div>}>
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
