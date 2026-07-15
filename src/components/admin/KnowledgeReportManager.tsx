'use client'

import { useState } from 'react'
import type { KnowledgeReportAdminItem } from '@/lib/knowledge-reports/admin'
import KnowledgeReportList from '@/components/admin/KnowledgeReportList'
import KnowledgeReportUploadForm from '@/components/admin/KnowledgeReportUploadForm'

interface KnowledgeReportManagerProps {
  initialReports: KnowledgeReportAdminItem[]
  schemaReady: boolean
}

export default function KnowledgeReportManager({ initialReports, schemaReady }: KnowledgeReportManagerProps) {
  const [reports, setReports] = useState(initialReports)

  return (
    <div className="space-y-10">
      <KnowledgeReportUploadForm
        disabled={!schemaReady}
        onCreated={(report) => setReports((current) => [report, ...current])}
      />
      <KnowledgeReportList
        reports={reports}
        onUpdated={(report) => setReports((current) => current.map((item) => item.id === report.id ? report : item))}
        onDeleted={(id) => setReports((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  )
}
