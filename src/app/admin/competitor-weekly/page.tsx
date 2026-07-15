import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminCompetitorWeeklyGenerate from '@/components/admin/AdminCompetitorWeeklyGenerate'
import AdminCompetitorWeeklyAnalyze from '@/components/admin/AdminCompetitorWeeklyAnalyze'
import AdminCompetitorWeeklySchedule from '@/components/admin/AdminCompetitorWeeklySchedule'
import CompetitorWeeklyManager, {
  type CompetitorWeeklyRow,
} from '@/components/admin/CompetitorWeeklyManager'
import { ListChecks } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '경쟁사 주간 브리핑 | 어드민 | Insight Out',
  description: '경쟁사 동향을 사업영역별로 종합한 주간 브리핑을 생성·확인합니다.',
}

export default async function CompetitorWeeklyAdminPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // 261 SQL 미적용(42P01)이면 graceful(빈 목록)
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select('id, week_start, week_end, status, overall_impact, summary, sections, generated_at')
    .order('week_start', { ascending: false })
    .limit(10)

  const reports = (error ? [] : (data as CompetitorWeeklyRow[] | null)) ?? []

  return (
    <div className="space-y-10">
      <AdminPageHeader />

      <AdminCompetitorWeeklyGenerate />

      <AdminCompetitorWeeklyAnalyze />

      <AdminCompetitorWeeklySchedule />

      <div>
        <AdminSectionHeader icon={ListChecks} title="최근 브리핑" hint="최신 10건 (초안 포함)" />
        {error && error.code === '42P01' ? (
          <AdminEmptyState message="주간 브리핑 테이블이 아직 준비되지 않았습니다 (SQL 미적용)." className="p-8 rounded-lg" />
        ) : (
          <CompetitorWeeklyManager initialReports={reports} />
        )}
      </div>
    </div>
  )
}
