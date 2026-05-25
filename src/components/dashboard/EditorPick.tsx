import { EDITOR_PICKS } from './mock-data'

export default function EditorPick() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h2 className="text-sm font-semibold text-gray-900">에디터 픽</h2>
        </div>
        <span className="text-xs text-gray-400">이번 주</span>
      </div>
      <div className="flex flex-col gap-3">
        {EDITOR_PICKS.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 cursor-pointer group rounded-xl p-3 hover:bg-gray-50 transition-colors -mx-1"
          >
            <div className="shrink-0 flex h-7 w-12 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">
              {item.badge}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-blue-700 line-clamp-2 mb-1">
                {item.title}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{item.category}</span>
                <span>{item.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
