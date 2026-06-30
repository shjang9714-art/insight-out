export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 페이지 제목 */}
      <div className="mb-6 space-y-1.5">
        <div className="h-6 w-32 rounded bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      </div>

      {/* 범위 필터 + 탭 스켈레톤 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
      </div>

      {/* 탭 스켈레톤 */}
      <div className="mb-6 h-8 w-36 rounded-lg bg-muted animate-pulse" />

      {/* 브리핑 카드 스켈레톤 */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 mb-10">
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* 인사이트 카드 스켈레톤 2개 */}
      <div className="space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded bg-muted animate-pulse" />
              <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-8 w-3/4 rounded bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
