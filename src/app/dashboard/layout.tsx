'use client'

import { useState, useEffect, Suspense } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import MorningBriefingPlayer from '@/components/dashboard/MorningBriefingPlayer'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ESC 로 모바일 드로어 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
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
            <div className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-white lg:hidden">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* audioUrl prop을 실제 URL로 교체하면 Coming Soon → 재생 가능 상태로 전환 */}
      <MorningBriefingPlayer />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
