import PageContainer from '@/components/PageContainer'

export default function Loading() {
  return (
    <PageContainer>
      {/* 탭 스켈레톤 */}
      <div className="mb-6 flex items-center gap-5 border-b border-border pb-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-4 w-16 rounded bg-muted animate-pulse" />
        ))}
      </div>

      {/* 카드 그리드 스켈레톤 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </PageContainer>
  )
}
