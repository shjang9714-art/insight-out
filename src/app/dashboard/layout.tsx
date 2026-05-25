'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import AIReportModal from '@/components/dashboard/AIReportModal'
import { DashboardContext } from './DashboardContext'
import { AI_REPORTS, type AIReport } from '@/components/dashboard/mock-data'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [reports, setReports] = useState<AIReport[]>(AI_REPORTS)
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedReport, setSelectedReport] = useState<AIReport | null>(null)

  const activeService = searchParams.get('service') ?? 'all'

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

  return (
    <DashboardContext.Provider value={ctx}>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="flex">
          <Sidebar
            activeService={activeService}
            onServiceChange={handleServiceChange}
            reports={reports}
            onSelectReport={(r) => setSelectedReport(r)}
            onOpenGenerate={() => setShowGenerate(true)}
          />
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
