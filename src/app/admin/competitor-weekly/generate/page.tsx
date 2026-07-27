import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { CompetitorWeeklyGenerateFlow } from '@/components/admin/CompetitorWeeklyGenerateFlow'
import type { CompetitorWeeklyRow } from '@/components/admin/CompetitorWeeklyManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '주간 브리핑 생성 | 어드민 | Insight Out',
  description: '사실 추출과 분석 2단계로 경쟁사 주간 브리핑을 생성합니다.',
}

export default async function CompetitorWeeklyGeneratePage() {
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

  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select('id, week_start, week_end, status, overall_impact, summary, sections, generated_at')
    .order('week_start', { ascending: false })
    .limit(10)

  const reports = (error ? [] : (data as CompetitorWeeklyRow[] | null)) ?? []

  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <CompetitorWeeklyGenerateFlow reports={reports} />
    </div>
  )
}
