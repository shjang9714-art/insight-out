import { Suspense } from 'react'
import Link from 'next/link'
import FeedSlot from '@/components/feed/FeedSlot'
import IssueSignals from '@/components/dashboard/IssueSignals'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import { ChevronRight, Building2 } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="px-4 py-6 sm:px-5">
      <div className="space-y-8">
        {/* 추천 질문 칩 — 콜드스타트 진입점 */}
        <SuggestedQuestions />

        {/* 1블록: 추천 피드 (신규/스킵/기존 분기 — FeedSlot) */}
        <section>
          <Suspense fallback={<div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">로딩 중...</div>}>
            <FeedSlot />
          </Suspense>
        </section>

        {/* 2블록: 급상승 이슈 신호 (이슈 없으면 숨김) */}
        <Suspense fallback={null}>
          <IssueSignals />
        </Suspense>

        {/* 3블록: 기업동향 요약 링크 */}
        <section>
          <Link
            href="/dashboard/entities"
            className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-600/40 hover:bg-brand-50/40 dark:hover:bg-brand-950/20"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
                <Building2 className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">기업동향</p>
                <p className="text-xs text-muted-foreground">경쟁사·KA 동향 및 엔티티 관계 탐색</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </div>
    </div>
  )
}
