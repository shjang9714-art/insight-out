'use client'

import { SERVICES, BOOKMARKED_ARTICLES, RECENT_VIEWS, SAVED_KEYWORDS, type AIReport } from './mock-data'

interface Props {
  activeService: string
  onServiceChange: (id: string) => void
  reports: AIReport[]
  onSelectReport: (report: AIReport) => void
  onOpenGenerate: () => void
  onClose?: () => void
}

export default function Sidebar({ activeService, onServiceChange, reports, onSelectReport, onOpenGenerate, onClose }: Props) {
  return (
    <aside className="w-56 shrink-0 border-r border-gray-100 bg-white">
      <div className="sticky top-14 h-[calc(100vh-56px)] space-y-5 overflow-y-auto px-3 py-4">

        {/* Service Navigation */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            서비스
          </h3>
          <div className="space-y-0.5">
            {SERVICES.map((svc) => {
              const isActive = activeService === svc.id
              return (
                <button
                  key={svc.id}
                  onClick={() => { onServiceChange(svc.id); onClose?.() }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-sm">{svc.label}</span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                </button>
              )
            })}
          </div>
        </section>

        <div className="border-t border-gray-100" />

        {/* Bookmarks */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            북마크
          </h3>
          <div className="space-y-0.5">
            {BOOKMARKED_ARTICLES.map((article) => (
              <div
                key={article.id}
                title="상세 보기 곧 제공"
                className="w-full rounded-lg px-2 py-2 cursor-default"
              >
                <p className="line-clamp-2 text-xs leading-snug text-gray-700">{article.title}</p>
                <span className="mt-0.5 inline-block text-[10px] text-gray-400">{article.date}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-gray-100" />

        {/* Recent Views */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            최근 본 항목
          </h3>
          <div className="space-y-0.5">
            {RECENT_VIEWS.map((item) => (
              <div
                key={item.id}
                title="상세 보기 곧 제공"
                className="w-full rounded-lg px-2 py-2 cursor-default"
              >
                <p className="line-clamp-2 text-xs leading-snug text-gray-700">{item.title}</p>
                <span className="mt-0.5 inline-block text-[10px] text-gray-400">{item.time}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-gray-100" />

        {/* Saved Keywords */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            저장된 키워드
          </h3>
          <div className="flex flex-wrap gap-1.5 px-2">
            {SAVED_KEYWORDS.map((kw) => (
              <span
                key={kw}
                title="상세 보기 곧 제공"
                className="cursor-default rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600"
              >
                {kw}
              </span>
            ))}
          </div>
        </section>

        <div className="border-t border-gray-100" />

        {/* AI Reports */}
        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              내 AI 보고서
            </h3>
            <button
              onClick={onOpenGenerate}
              className="rounded p-0.5 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
              title="보고서 생성"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => { onSelectReport(r); onClose?.() }}
                className="group w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-brand-50"
              >
                <p className="line-clamp-1 text-xs font-medium text-gray-800 group-hover:text-brand-600">
                  {r.title}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                    {r.service}
                  </span>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
