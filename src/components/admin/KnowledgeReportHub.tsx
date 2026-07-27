'use client'

import { useState } from 'react'
import type { KnowledgeReportAdminItem } from '@/lib/knowledge-reports/admin'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import KnowledgeReportList from '@/components/admin/KnowledgeReportList'
import KnowledgeReportUploadForm from '@/components/admin/KnowledgeReportUploadForm'

const TABS = [
  { value: 'list',   label: '발행 콘텐츠' },
  { value: 'upload', label: '보고서 등록' },
]

interface KnowledgeReportHubProps {
  initialReports: KnowledgeReportAdminItem[]
  schemaReady: boolean
  /** 399 — 스키마 미적용/조회 오류 안내. 탭과 무관하게 항상 보여야 하므로 AdminTabShell의 contextBar로 렌더. */
  bannerMessage: string | null
}

export default function KnowledgeReportHub({ initialReports, schemaReady, bannerMessage }: KnowledgeReportHubProps) {
  const [reports, setReports] = useState(initialReports)

  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="list"
      aria-label="지식보고서 관리"
      contextBar={bannerMessage ? <AdminErrorBox>{bannerMessage}</AdminErrorBox> : undefined}
      renderContent={(tab) =>
        tab === 'list' ? (
          <KnowledgeReportList
            reports={reports}
            onUpdated={(report) => setReports((current) => current.map((item) => item.id === report.id ? report : item))}
            onDeleted={(id) => setReports((current) => current.filter((item) => item.id !== id))}
          />
        ) : (
          <KnowledgeReportUploadForm
            disabled={!schemaReady}
            onCreated={(report) => setReports((current) => [report, ...current])}
          />
        )
      }
    />
  )
}
