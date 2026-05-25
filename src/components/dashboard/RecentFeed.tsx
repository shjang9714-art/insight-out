import { RECENT_FEED, SERVICES } from './mock-data'

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-brand-50 text-brand-600',
  yellow: 'bg-yellow-50 text-yellow-700',
  purple: 'bg-purple-50 text-purple-700',
  green: 'bg-green-50 text-green-700',
}

interface Props {
  activeService?: string
}

export default function RecentFeed({ activeService = 'all' }: Props) {
  const serviceLabel = activeService !== 'all'
    ? SERVICES.find((s) => s.id === activeService)?.label
    : null

  const items = serviceLabel
    ? RECENT_FEED.filter((item) => item.service === serviceLabel)
    : RECENT_FEED

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">최근 피드</h2>
        <button className="text-xs text-brand-600 hover:underline">전체 보기</button>
      </div>
      <div className="flex flex-col divide-y divide-gray-50">
        {items.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">해당 서비스의 최근 피드가 없습니다</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 group cursor-pointer">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[item.categoryColor]}`}>
                  {item.category}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  {item.service}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-brand-600 line-clamp-2 mb-1">
                {item.title}
              </p>
              <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">{item.summary}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{item.source}</span>
                <span>·</span>
                <span>{item.time}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
