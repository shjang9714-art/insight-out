import { CATEGORIES } from './mock-data'

export default function CategoryGrid() {
  return (
    <div className="grid grid-cols-8 gap-3">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-center transition-all hover:border-brand-200 hover:shadow-sm group"
        >
          <div className="relative">
            <span className="text-2xl">{cat.icon}</span>
            {cat.count > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {cat.count}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-gray-700 leading-tight group-hover:text-brand-600">
            {cat.label}
          </span>
        </button>
      ))}
    </div>
  )
}
