'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import RecentFeed from '@/components/dashboard/RecentFeed'
import CompetitorTrends from '@/components/dashboard/CompetitorTrends'
import EmailArchiveWidget from '@/components/dashboard/EmailArchiveWidget'
import ServiceTabs from '@/components/dashboard/ServiceTabs'
import SearchBar from '@/components/dashboard/SearchBar'

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const activeService = searchParams.get('service') ?? 'all'

  function handleServiceChange(serviceId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (serviceId === 'all') params.delete('service')
    else params.set('service', serviceId)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <CategoryGrid activeService={activeService} />

      {/* 아카이빙 콘텐츠 메일 발송 (구 AI 보고서 자리) */}
      <EmailArchiveWidget />

      {/* 최근 피드 → 그 아래 경쟁사 동향 */}
      <RecentFeed activeService={activeService} />
      <CompetitorTrends />

      {/* 서비스 가로 탭 + 콘텐츠 검색 (콘텐츠 하단) */}
      <div className="space-y-3 border-t border-gray-100 pt-6">
        <ServiceTabs activeService={activeService} onChange={handleServiceChange} />
        <SearchBar />
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
