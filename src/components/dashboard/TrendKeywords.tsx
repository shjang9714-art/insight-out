import { TREND_KEYWORDS } from './mock-data'

const SIZE_STYLES = {
  xl: 'text-base font-bold px-4 py-2 bg-brand-600 text-white',
  lg: 'text-sm font-semibold px-3.5 py-1.5 bg-brand-100 text-brand-700',
  md: 'text-sm font-medium px-3 py-1.5 bg-gray-100 text-gray-700',
  sm: 'text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600',
  xs: 'text-xs px-2.5 py-1 bg-gray-50 text-gray-500 border border-gray-200',
}

export default function TrendKeywords() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">트렌드 키워드</h2>
        <span className="text-xs text-gray-400">최근 7일</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TREND_KEYWORDS.map((item) => (
          <span
            key={item.keyword}
            title="키워드 컨텍스트 기능 곧 제공"
            className={`rounded-full cursor-default ${SIZE_STYLES[item.size]}`}
          >
            {item.keyword}
          </span>
        ))}
      </div>
    </div>
  )
}
