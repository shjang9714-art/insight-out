import { COMPETITOR_TRENDS, type CompetitorTrend } from './mock-data'

const LOGO_COLORS: Record<string, string> = {
  red: 'bg-red-600',
  rose: 'bg-rose-600',
  pink: 'bg-pink-600',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-600',
}

function CompetitorBlock({ competitor }: { competitor: CompetitorTrend }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`flex h-6 w-10 items-center justify-center rounded-md text-[11px] font-bold text-white ${
            LOGO_COLORS[competitor.color] ?? 'bg-muted-foreground'
          }`}
        >
          {competitor.logo}
        </div>
        <span className="text-sm font-semibold text-foreground">{competitor.company}</span>
      </div>
      <div className="flex flex-col gap-1.5 pl-12">
        {competitor.items.map((item, i) => (
          <div key={i} className="group cursor-pointer">
            <p className="text-xs text-foreground/90 leading-snug group-hover:text-blue-700 line-clamp-2">
              {item.text}
            </p>
            <span className="text-[11px] text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CompetitorTrends() {
  const telecom = COMPETITOR_TRENDS.filter((c) => c.group === 'telecom')
  const bigtech = COMPETITOR_TRENDS.filter((c) => c.group === 'bigtech')

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <h2 className="text-sm font-semibold text-foreground">경쟁사 동향</h2>
        </div>
        <button className="text-xs text-blue-600 hover:underline">전체 보기</button>
      </div>

      {/* 국내 통신사 — 매일 디폴트 노출 */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">국내 통신사</h3>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">매일 기본 노출</span>
      </div>
      <div className="flex flex-col gap-5">
        {telecom.map((c) => (
          <CompetitorBlock key={c.id} competitor={c} />
        ))}
      </div>

      <div className="my-4 border-t border-border" />

      {/* 글로벌 빅테크 — 매일 최신 이슈로 갱신 */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">글로벌 빅테크</h3>
        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">최신 이슈 갱신</span>
      </div>
      <div className="flex flex-col gap-5">
        {bigtech.map((c) => (
          <CompetitorBlock key={c.id} competitor={c} />
        ))}
      </div>
    </div>
  )
}
