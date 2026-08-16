import PageContainer from '@/components/PageContainer'
import { CONTENT_GRID_CLASS } from '@/lib/contents/card-contract'

export default function Loading() {
  return (
    <PageContainer>
      <div className="space-y-8">
        {/* 위젯 섹션 스켈레톤 (개인화 넛지·방문 델타 등) */}
        <div className="h-16 rounded-2xl border border-border bg-card animate-pulse" />

        {/* 이슈 신호 스켈레톤 */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>

        {/* 브리핑 하이라이트 스켈레톤 */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
        </div>

        {/* 피드 카드 스켈레톤 */}
        <div className={CONTENT_GRID_CLASS}>
          {[0, 1, 2].map(i => (
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
      </div>
    </PageContainer>
  )
}
