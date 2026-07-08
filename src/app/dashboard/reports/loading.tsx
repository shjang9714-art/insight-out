import PageContainer from '@/components/PageContainer'

export default function Loading() {
  return (
    <PageContainer>
      {/* 헤더(설명 + 새 보고서 버튼) 스켈레톤 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="h-4 w-56 rounded bg-muted animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-muted animate-pulse" />
      </div>

      {/* 보고서 행 리스트 스켈레톤 */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <div className="h-5 w-5 shrink-0 rounded bg-muted animate-pulse" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-3 w-16 shrink-0 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </PageContainer>
  )
}
