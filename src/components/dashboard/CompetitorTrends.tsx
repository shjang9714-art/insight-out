import { COMPETITOR_TRENDS } from './mock-data'

const LOGO_COLORS: Record<string, string> = {
  red: 'bg-red-600',
  pink: 'bg-pink-600',
  orange: 'bg-orange-500',
}

export default function CompetitorTrends() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <h2 className="text-sm font-semibold text-gray-900">경쟁사 동향</h2>
        </div>
        <button className="text-xs text-blue-600 hover:underline">전체 보기</button>
      </div>
      <div className="flex flex-col gap-5">
        {COMPETITOR_TRENDS.map((competitor) => (
          <div key={competitor.id}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-6 w-10 items-center justify-center rounded-md text-[11px] font-bold text-white ${LOGO_COLORS[competitor.color]}`}>
                {competitor.logo}
              </div>
              <span className="text-sm font-semibold text-gray-800">{competitor.company}</span>
            </div>
            <div className="flex flex-col gap-1.5 pl-12">
              {competitor.items.map((item, i) => (
                <div key={i} className="group cursor-pointer">
                  <p className="text-xs text-gray-700 leading-snug group-hover:text-blue-700 line-clamp-2">
                    {item.text}
                  </p>
                  <span className="text-[11px] text-gray-400">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
