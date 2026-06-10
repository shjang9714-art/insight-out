'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import ServiceTabs from '@/components/dashboard/ServiceTabs'
import SearchBar from '@/components/dashboard/SearchBar'

function shouldHideTopNav(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/mypage')) return true
  if (/^\/dashboard\/contents\/.+/.test(pathname)) return true
  return false
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen]       = useState(false)
  const [stripVisible, setStripVisible]     = useState(true)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const pathname      = usePathname()
  const lastScrollY   = useRef(0)

  const activeService  = searchParams.get('svc') ?? 'all'
  const activeCategory = searchParams.get('category') ?? ''
  const hideTopNav     = shouldHideTopNav(pathname)

  function handleServiceChange(serviceId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (serviceId === 'all') params.delete('svc')
    else params.set('svc', serviceId)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  // 스크롤 방향 감지 — 다운 시 스트립 숨김, 업 시 표시
  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY
      if (current > lastScrollY.current + 4) {
        setStripVisible(false)
      } else if (current < lastScrollY.current - 4) {
        setStripVisible(true)
      }
      lastScrollY.current = current
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

      {/* ── 카테고리 스트립 + 서비스 셀렉터 + 검색 (sticky, 얇게) ─────────── */}
      {!hideTopNav && (
        <div
          className={`sticky top-14 z-10 border-b border-border bg-card transition-transform duration-200 ${
            stripVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="mx-auto flex w-full max-w-screen-xl items-center gap-3 px-4 py-2 sm:px-6">
            {/* 카테고리 칩: 모바일 검색 펼쳐진 상태에서는 숨김 */}
            <div className={`min-w-0 flex-1 overflow-hidden ${searchExpanded ? 'hidden sm:block' : ''}`}>
              <CategoryGrid activeService={activeService} activeCategory={activeCategory} />
            </div>

            {/* 검색창: sm+ 항상 표시 / 모바일은 펼칠 때만 */}
            <div className={`${searchExpanded ? 'flex-1' : 'hidden'} sm:block sm:w-56 sm:flex-none`}>
              <SearchBar onClose={() => setSearchExpanded(false)} />
            </div>

            {/* 검색 아이콘: 모바일에서 검색창 접혀 있을 때만 */}
            {!searchExpanded && (
              <button
                onClick={() => setSearchExpanded(true)}
                className="shrink-0 rounded-lg p-2 hover:bg-accent sm:hidden"
                aria-label="검색"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
            )}

            <ServiceTabs activeService={activeService} onChange={handleServiceChange} />
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
