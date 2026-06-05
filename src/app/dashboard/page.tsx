'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import TrendKeywords from '@/components/dashboard/TrendKeywords'
import RecentFeed from '@/components/dashboard/RecentFeed'
import EditorPick from '@/components/dashboard/EditorPick'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import { useDashboard } from './DashboardContext'

function DashboardContent() {
  const searchParams = useSearchParams()
  const activeService = searchParams.get('service') ?? 'all'
  const { reports, openGenerateModal, openReportDetail } = useDashboard()

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <CategoryGrid activeService={activeService} />
      <TrendKeywords />

      {/* AI Report Banner */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-pink-50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <h2 className="text-sm font-semibold text-gray-900">AI 보고서</h2>
            </div>
            <p className="text-xs text-gray-500">
              수집된 아티클을 기반으로 맞춤형 인사이트 보고서를 자동 생성합니다
            </p>
          </div>
          <button
            onClick={openGenerateModal}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            보고서 생성
          </button>
        </div>
        {reports.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {reports.slice(0, 4).map((r) => (
              <button
                key={r.id}
                onClick={() => openReportDetail(r)}
                className="shrink-0 rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-600 hover:shadow-sm"
              >
                <p className="max-w-[160px] truncate text-xs font-medium text-gray-800">{r.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                    {r.service}
                  </span>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom 3-column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <RecentFeed activeService={activeService} />
        </div>
        <div className="lg:col-span-1">
          <EditorPick />
        </div>
        <div className="lg:col-span-1">
          <CompetitorTrends />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">로딩 중...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
