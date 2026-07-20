'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminCompetitorWeeklyGenerate from '@/components/admin/AdminCompetitorWeeklyGenerate'
import AdminCompetitorWeeklyAnalyze from '@/components/admin/AdminCompetitorWeeklyAnalyze'
import AdminCompetitorWeeklySchedule from '@/components/admin/AdminCompetitorWeeklySchedule'
import CompetitorWeeklyManager, {
  type CompetitorWeeklyRow,
} from '@/components/admin/CompetitorWeeklyManager'

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
  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="list"
      aria-label="경쟁사 주간리포트 관리"
      renderContent={(tab) =>
        tab === 'list'
          ? schemaMissing
            ? <AdminEmptyState message="주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용)." className="p-8 rounded-lg" />
            : <CompetitorWeeklyManager initialReports={initialReports} />
          : tab === 'generate'
            ? <AdminCompetitorWeeklyGenerate />
            : tab === 'analyze'
              ? <AdminCompetitorWeeklyAnalyze />
              : <AdminCompetitorWeeklySchedule />
      }
    />
  )
}
