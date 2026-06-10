'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
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
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false)
        setSearchExpanded(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />

      {/* ── 스티키 서브 네비 (서비스 탭 + 검색창) — 헤더(56px) 바로 아래 ── */}
      {!hideTopNav && (
        <div className="sticky top-14 z-10 border-b border-border bg-card/90 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-2 sm:px-6">
            {/* 서비스 탭: 검색 펼쳐진 모바일에서는 숨김 */}
            <div className={`min-w-0 flex-1 ${searchExpanded ? 'hidden sm:block' : ''}`}>
              <ServiceTabs activeService={activeService} onChange={handleServiceChange} />
            </div>

            {/* 검색창: sm+ 항상 표시 / 모바일은 펼칠 때만 표시 */}
            <div className={`${searchExpanded ? 'flex-1' : 'hidden'} sm:block sm:w-64 sm:flex-none`}>
              <SearchBar onClose={() => setSearchExpanded(false)} />
            </div>

            {/* 검색 아이콘 버튼: 모바일에서 검색창 접혀 있을 때만 */}
            {!searchExpanded && (
              <button
                onClick={() => setSearchExpanded(true)}
                className="shrink-0 rounded-lg p-2 hover:bg-accent sm:hidden"
                aria-label="검색"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 카테고리 칩 리스트 (스크롤 시 사라지는 일반 배치) ────────────── */}
      {!hideTopNav && (
        <div className="border-b border-border bg-card px-4 py-3 sm:px-6">
          <CategoryGrid activeService={activeService} />
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

        <main className="min-w-0 flex-1">{children}</main>
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
