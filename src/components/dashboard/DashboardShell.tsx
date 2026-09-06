'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import DashboardHeader, { NAV_TABS } from '@/components/dashboard/DashboardHeader'
import FloatingBriefingMini from '@/components/dashboard/FloatingBriefingMini'
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav'
import InterestPanel from '@/components/interests/InterestPanel'
import LensStatusBar from '@/components/lens/LensStatusBar'
import SearchOverlay from '@/components/mobile/SearchOverlay'
import ContentsL2Tabs from '@/components/nav/ContentsL2Tabs'
import { resolveActiveNav } from '@/lib/nav/active'

// layout.tsx · DashboardHeader.tsx의 CONTENT_DETAIL_PATTERN과 반드시 동일해야 한다.
const CONTENT_DETAIL_PATTERN = /^\/dashboard\/contents\/[^/]+$/

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { l1Href: activeL1Href } = resolveActiveNav(pathname, searchParams)
  // 콘텐츠 상세 전체 페이지(새 탭 진입 등, 인터셉트 모달과 무관)는 헤더/L1·L2 탭·
  // 하단 내비·플로팅 브리핑까지 전부 숨기고 기사만 보이는 화면으로 렌더한다.
  // 인터셉트 모달(@modal/(.)contents/[id])은 이 컴포넌트를 거치지 않는 별도 슬롯이라 영향 없음.
  const isContentDetail = CONTENT_DETAIL_PATTERN.test(pathname)

  // ⌘K(mac)/Ctrl+K(win) — 어디에 포커스가 있든 통합검색 오버레이를 열기/닫기 토글(A 스펙).
  // 오버레이 안 입력창에 포커스가 있어도 동일하게 토글되고, 닫기는 Radix Dialog의
  // 기본 ESC 처리(포커스 트랩 내부 어디서든 동작)에 맡긴다 — 별도 ESC 핸들러 불필요.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (isContentDetail) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-6xl print:max-w-none">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        className="print:hidden"
        onMenuClick={() => setSidebarOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* 564 — 모바일 L2. 데스크톱은 헤더 호버 패널(563)이 담당하지만 모바일은 호버가
          없어 활성 L1의 L2를 항상 가로로 노출한다. 헤더 밖·비sticky로 둬서 ContentsBoard
          (:262,:737)와 search/page(:135)의 top-14/md:top-24 오프셋을 건드리지 않는다.
          L2가 없는 L1(홈·키워드 분석·관계지도·기업동향)에서는 이 컴포넌트가 null을
          반환해 아무것도 렌더되지 않는다. */}
      {activeL1Href && (
        <ContentsL2Tabs
          l1Href={activeL1Href}
          orientation="horizontal"
          className="border-b border-border bg-card md:hidden print:hidden"
        />
      )}

      {/* 풀폭 본문 */}
      <main className="mx-auto w-full max-w-6xl pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 print:max-w-none print:pb-0">
        <LensStatusBar />
        {children}
      </main>

      <MobileBottomNav />
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />

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
                const active = activeL1Href === tab.href
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

      {/* 616 — 좌측 하단 관심사. 우측 하단 브리핑 미니와 대칭 */}
      <div className="print:hidden">
        <InterestPanel />
      </div>

      {/* 플로팅 모닝브리핑 미니 플레이어 */}
      <div className="print:hidden">
        <FloatingBriefingMini />
      </div>
    </div>
  )
}
