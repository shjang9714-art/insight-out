'use client'

import { useState } from 'react'
import ServiceTabs from '@/components/dashboard/ServiceTabs'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import TrendKeywords from '@/components/dashboard/TrendKeywords'
import RecentFeed from '@/components/dashboard/RecentFeed'
import EditorPick from '@/components/dashboard/EditorPick'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'

export default function DashboardPage() {
  const [activeService, setActiveService] = useState('all')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-gray-900 tracking-tight">Insight Out</span>
            <span className="hidden sm:block text-xs text-gray-400">B2B Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-sm text-gray-500 hover:text-gray-900">마이페이지</button>
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              나
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-6 py-6 space-y-6">
        {/* Service Tabs */}
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <ServiceTabs activeService={activeService} onChange={setActiveService} />
        </div>

        {/* Category Grid */}
        <CategoryGrid />

        {/* Trend Keywords */}
        <TrendKeywords />

        {/* Bottom 3-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Feed — wider */}
          <div className="lg:col-span-1">
            <RecentFeed />
          </div>

          {/* Editor Pick */}
          <div className="lg:col-span-1">
            <EditorPick />
          </div>

          {/* Competitor Trends */}
          <div className="lg:col-span-1">
            <CompetitorTrends />
          </div>
        </div>
      </main>
    </div>
  )
}
