'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import ServiceTabs from '@/components/dashboard/ServiceTabs'

function shouldHideTopNav(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/mypage')) return true
  if (/^\/dashboard\/contents\/.+/.test(pathname)) return true
  return false
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(true)
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const pathname      = usePathname()
  const lastScrollY   = useRef(0)

  // 전역 svc 파라미터(UUID). 없으면 'all'
  const activeService = searchParams.get('svc') ?? 'all'
  const activeCategory = searchParams.get('category') ?? ''
  const hideTopNav    = shouldHideTopNav(pathname)

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
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />

      {/* ── 카테고리 스트립 + 서비스 셀렉터 (sticky, 얇게) ─────────────────── */}
      {!hideTopNav && (
        <div
          className={`sticky top-14 z-10 border-b border-border bg-card transition-transform duration-200 ${
            stripVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="mx-auto flex w-full max-w-screen-xl items-center gap-3 px-4 py-2 sm:px-6">
            <div className="min-w-0 flex-1 overflow-hidden">
              <CategoryGrid activeService={activeService} activeCategory={activeCategory} />
            </div>
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
