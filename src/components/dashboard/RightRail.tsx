import Link from 'next/link'
import CompetitorTrends from './CompetitorTrends'
import MorningBriefingPlayer from './MorningBriefingPlayer'
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

export default function RightRail() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <MorningBriefingPlayer />
        <div className="mt-2 text-right">
          <Link
            href="/dashboard/briefings"
            className="text-xs text-brand-600 hover:underline"
          >
            지난 브리핑 보기 →
          </Link>
        </div>
      </div>
      <CompetitorTrends />
      <TrendingKeywords />
    </div>
  )
}
