'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminCompetitorWeeklyGenerate from '@/components/admin/AdminCompetitorWeeklyGenerate'
import AdminCompetitorWeeklyAnalyze from '@/components/admin/AdminCompetitorWeeklyAnalyze'
import AdminCompetitorWeeklySchedule from '@/components/admin/AdminCompetitorWeeklySchedule'
import CompetitorWeeklyManager, {
  type CompetitorWeeklyRow,
} from '@/components/admin/CompetitorWeeklyManager'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import { buildEnrichRunId } from '@/lib/admin/enrich-jobs'

const TABS = [
  { value: 'list',     label: '발행 브리핑' },
  { value: 'generate', label: '생성 실행' },
  { value: 'analyze',  label: '분석 (패스②)' },
  { value: 'settings', label: '생성 설정' },
]

interface CompetitorWeeklyHubProps {
  initialReports: CompetitorWeeklyRow[]
  schemaMissing: boolean
}

export default function CompetitorWeeklyHub({ initialReports, schemaMissing }: CompetitorWeeklyHubProps) {
  const router = useRouter()
  const { runs } = useEnrichJobs()
  const runStatus = runs.get(buildEnrichRunId('admin:competitor-weekly'))?.status
  const reportsKey = initialReports.map((report) => `${report.id}:${report.generated_at}`).join('|')

  useEffect(() => {
    if (runStatus === 'done') router.refresh()
  }, [router, runStatus])

  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="list"
      aria-label="경쟁사 주간리포트 관리"
      renderContent={(tab) =>
        tab === 'list'
          ? schemaMissing
            ? <AdminEmptyState message="주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용)." className="p-8 rounded-lg" />
            : <CompetitorWeeklyManager key={reportsKey} initialReports={initialReports} />
          : tab === 'generate'
            ? <AdminCompetitorWeeklyGenerate />
            : tab === 'analyze'
              ? <AdminCompetitorWeeklyAnalyze reports={initialReports} />
              : <AdminCompetitorWeeklySchedule />
      }
    />
  )
}
