'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import DashboardHeader, { NAV_TABS, isTabActive } from '@/components/dashboard/DashboardHeader'
import FloatingBriefingMini from '@/components/dashboard/FloatingBriefingMini'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader className="print:hidden" onMenuClick={() => setSidebarOpen(true)} />

      {/* 풀폭 본문 */}
      <main className="mx-auto w-full max-w-6xl print:max-w-none">
        {children}
      </main>

      {/* 모바일 드로어 (md 미만에서만) */}
      {sidebarOpen && (
        <div className="print:hidden">
          <div
            className="fixed inset-0 z-30 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-card md:hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">메뉴</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="p-2">
              {NAV_TABS.map((tab) => {
	                const active = isTabActive(tab.href, tab.exact, pathname)
	                return (
	                  // prefetch-ok: 네비 탭 — 개수 고정, 이동 잦음
	                  <Link
	                    key={tab.href}
                    href={tab.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30'
                        : 'text-foreground/80 hover:bg-accent'
                    }`}
                  >
                    <span>{tab.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 플로팅 모닝브리핑 미니 플레이어 */}
      <div className="print:hidden">
        <FloatingBriefingMini />
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
