'use client'

import type { ReactNode } from 'react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'

const ACTIVITY_TABS = [
  { value: 'job-runs', label: '작업 이력' },
  { value: 'audit', label: '감사 로그' },
  { value: 'crawl-logs', label: '로그 분석' },
]

const ACTIVITY_TAB_PARAM_KEYS = ['page', 'status', 'job', 'range', 'sort', 'dir'] as const

interface ActivityHubProps {
  jobRunsPanel: ReactNode | null
  auditPanel: ReactNode | null
  crawlLogsPanel: ReactNode | null
}

/** 524 — 작업 이력·감사 로그·로그 분석 통합. 활성 탭에 해당하는 패널만 서버에서 미리 렌더해 전달받는다. */
export default function ActivityHub({ jobRunsPanel, auditPanel, crawlLogsPanel }: ActivityHubProps) {
  return (
    <AdminTabShell
      tabs={ACTIVITY_TABS}
      defaultTab="job-runs"
      resetParamKeys={ACTIVITY_TAB_PARAM_KEYS}
      aria-label="실행 이력"
      renderContent={(tab) => {
        if (tab === 'audit') return auditPanel
        if (tab === 'crawl-logs') return crawlLogsPanel
        return jobRunsPanel
      }}
    />
  )
}
