import { RECENT_FEED } from './mock-data'

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  purple: 'bg-purple-50 text-purple-700',
  green: 'bg-green-50 text-green-700',
}

export default function RecentFeed() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">최근 피드</h2>
        <button className="text-xs text-blue-600 hover:underline">전체 보기</button>
      </div>
      <div className="flex flex-col divide-y divide-gray-50">
        {RECENT_FEED.map((item) => (
          <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 group cursor-pointer">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[item.categoryColor]}`}>
                {item.category}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                {item.service}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-blue-700 line-clamp-2 mb-1">
              {item.title}
            </p>
            <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">{item.summary}</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{item.source}</span>
              <span>·</span>
              <span>{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
