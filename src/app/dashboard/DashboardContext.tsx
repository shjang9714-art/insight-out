'use client'

import { createContext, useContext } from 'react'
import type { AIReport } from '@/components/dashboard/mock-data'

interface DashboardCtx {
  reports: AIReport[]
  openGenerateModal: () => void
  openReportDetail: (report: AIReport) => void
}

export const DashboardContext = createContext<DashboardCtx>({
  reports: [],
  openGenerateModal: () => {},
  openReportDetail: () => {},
})

export const useDashboard = () => useContext(DashboardContext)
