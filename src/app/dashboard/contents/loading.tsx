import PageContainer from '@/components/PageContainer'

export default function Loading() {
  return (
    <PageContainer>
      {/* 소스타입 탭 스켈레톤 */}
      <div className="mb-5 flex items-center gap-5 border-b border-border pb-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-4 w-14 rounded bg-muted animate-pulse" />
        ))}
      </div>

      {/* 제목 + 뷰 토글 스켈레톤 */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
      </div>

      {/* 카드 그리드 스켈레톤(2~3열) */}
      <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="aspect-[16/9] bg-muted animate-pulse" />
            <div className="space-y-2 p-5">
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  )
}
