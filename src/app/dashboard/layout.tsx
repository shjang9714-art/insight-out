'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import CategoryGrid from '@/components/dashboard/CategoryGrid'
import RightRail from '@/components/dashboard/RightRail'

// 카테고리 타일을 숨길 페이지 (상세·마이페이지)
function shouldHideCategoryTiles(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/mypage')) return true
  if (pathname.startsWith('/dashboard/briefings')) return true
  if (/^\/dashboard\/contents\/.+/.test(pathname)) return true
  return false
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tilesVisible, setTilesVisible] = useState(true)
  const pathname    = usePathname()
  const lastScrollY = useRef(0)

  const hideTiles = shouldHideCategoryTiles(pathname)

  // 스크롤 방향 감지 — 다운 시 타일 숨김, 업 시 표시
  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY
      if (current > lastScrollY.current + 4) {
        setTilesVisible(false)
      } else if (current < lastScrollY.current - 4) {
        setTilesVisible(true)
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

      {/* ── 3단 그리드: 좌(사이드바) | 중앙(카테고리+콘텐츠) | 우(레일) ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)_300px]">

        {/* 좌 패널: 데스크톱(lg+) 고정 사이드바, lg에서 2행 스팬 */}
        <div className="hidden lg:block lg:row-span-2 xl:row-span-1">
          <Sidebar />
        </div>

        {/* 중앙 컬럼 */}
        <div className="min-w-0">
          {/* 카테고리 타일 (목록형 페이지에서만, sticky) */}
          {!hideTiles && (
            <div
              className={`sticky top-14 z-10 border-b border-border bg-background transition-transform duration-200 ${
                tilesVisible ? 'translate-y-0' : '-translate-y-full'
              }`}
            >
              <div className="px-4 py-2 sm:px-5">
                <CategoryGrid />
              </div>
            </div>
          )}

          <main className="mx-auto w-full max-w-screen-xl">
            {children}
          </main>
        </div>

        {/* 우 패널: xl에서 3번째 열(sticky 풀하이트), lg에서 중앙 하단 스택 */}
        <div className="xl:col-start-3 xl:row-start-1 xl:sticky xl:top-14 xl:h-[calc(100vh-56px)] xl:overflow-y-auto">
          <RightRail />
        </div>
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
