import { Mic } from 'lucide-react'
import CompetitorTrends from './CompetitorTrends'
import { SAVED_KEYWORDS } from './mock-data/taxonomy'

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

export default function RightRail() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <BriefingPlaceholder />
      <CompetitorTrends />
      <TrendingKeywords />
    </div>
  )
}
