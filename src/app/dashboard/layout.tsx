'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import MorningBriefingPlayer from '@/components/dashboard/MorningBriefingPlayer'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import ServiceTabs from '@/components/dashboard/ServiceTabs'
import SearchBar from '@/components/dashboard/SearchBar'

// 상단 네비게이션을 숨길 경로
// - /dashboard/mypage : 설정 페이지
// - /dashboard/contents/[id] : 콘텐츠 상세 페이지
function shouldHideTopNav(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/mypage')) return true
  if (/^\/dashboard\/contents\/.+/.test(pathname)) return true
  return false
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const pathname      = usePathname()

  const activeService = searchParams.get('service') ?? 'all'
  const hideTopNav    = shouldHideTopNav(pathname)

  function handleServiceChange(serviceId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (serviceId === 'all') params.delete('service')
    else params.set('service', serviceId)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  // ESC 로 모바일 드로어 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />

      {/* ── 영구 상단 네비게이션 (카테고리·서비스·검색) ─────────────────── */}
      {!hideTopNav && (
        <div className="sticky top-14 z-10 border-b border-border bg-card px-4 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-screen-xl">
            <CategoryGrid activeService={activeService} />
            <div className="mt-3 space-y-2.5 border-t border-border pt-3">
              <ServiceTabs activeService={activeService} onChange={handleServiceChange} />
              <SearchBar />
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* 데스크톱(lg+) 고정 사이드바 */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* 모바일 드로어 */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-card lg:hidden">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-screen-xl">{children}</div>
        </main>
      </div>

      <MorningBriefingPlayer />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
