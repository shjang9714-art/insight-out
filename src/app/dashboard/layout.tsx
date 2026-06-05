'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import AIReportModal from '@/components/dashboard/AIReportModal'
import MorningBriefingPlayer from '@/components/dashboard/MorningBriefingPlayer'
import { DashboardContext } from './DashboardContext'
import { AI_REPORTS, type AIReport } from '@/components/dashboard/mock-data'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [reports, setReports] = useState<AIReport[]>(AI_REPORTS)
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedReport, setSelectedReport] = useState<AIReport | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeService = searchParams.get('service') ?? 'all'

  // ESC 로 모바일 드로어 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleServiceChange(serviceId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (serviceId === 'all') params.delete('service')
    else params.set('service', serviceId)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  const ctx = {
    reports,
    openGenerateModal: () => setShowGenerate(true),
    openReportDetail: (r: AIReport) => setSelectedReport(r),
  }

  const sidebarProps = {
    activeService,
    onServiceChange: handleServiceChange,
    reports,
    onSelectReport: (r: AIReport) => setSelectedReport(r),
    onOpenGenerate: () => setShowGenerate(true),
  }

  return (
    <DashboardContext.Provider value={ctx}>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex">
          {/* 데스크톱(lg+) 고정 사이드바 */}
          <div className="hidden lg:block">
            <Sidebar {...sidebarProps} />
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
                <Sidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} />
              </div>
            </>
          )}

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>

      {showGenerate && (
        <AIReportModal
          mode="generate"
          onGenerated={(r) => setReports((prev) => [r, ...prev])}
          onClose={() => setShowGenerate(false)}
        />
      )}
      {selectedReport && (
        <AIReportModal
          mode="detail"
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}

      {/* audioUrl prop을 실제 URL로 교체하면 Coming Soon → 재생 가능 상태로 전환 */}
      <MorningBriefingPlayer />
    </DashboardContext.Provider>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
