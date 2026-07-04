import { Suspense } from 'react'
import FeedSlot from '@/components/feed/FeedSlot'
import IssueSignals from '@/components/dashboard/IssueSignals'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import VisitDelta from '@/components/dashboard/VisitDelta'
import PersonalizationNudge from '@/components/dashboard/PersonalizationNudge'
import PageContainer from '@/components/PageContainer'

export default function DashboardPage() {
  return (
    <PageContainer>
      <div className="space-y-8">
        {/* 개인화 미설정 유도 배너 */}
        <Suspense fallback={null}>
          <PersonalizationNudge />
        </Suspense>

        {/* 방문 델타 배지 — 지난 방문 이후 새 항목 */}
        <Suspense fallback={null}>
          <VisitDelta />
        </Suspense>

        {/* 추천 질문 칩 — 콜드스타트 진입점 */}
        <SuggestedQuestions />

        {/* 1블록: 급상승 이슈 신호 (이슈 없으면 숨김) — 실검 스타일 롤링 */}
        <Suspense fallback={null}>
          <IssueSignals />
        </Suspense>

        {/* 2블록: 추천 피드 (신규/스킵/기존 분기 — FeedSlot) */}
        <section>
          <Suspense fallback={<div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">로딩 중...</div>}>
            <FeedSlot />
          </Suspense>
        </section>
      </div>
    </PageContainer>
  )
}
