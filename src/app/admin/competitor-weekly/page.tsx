import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminCompetitorWeeklyGenerate from '@/components/admin/AdminCompetitorWeeklyGenerate'
import AdminCompetitorWeeklyAnalyze from '@/components/admin/AdminCompetitorWeeklyAnalyze'
import AdminCompetitorWeeklySchedule from '@/components/admin/AdminCompetitorWeeklySchedule'
import { cn } from '@/lib/utils'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { ListChecks } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '경쟁사 주간 리포트 | 어드민 | Insight Out',
  description: '경쟁사 동향을 사업영역별로 종합한 주간 리포트를 생성·확인합니다.',
}

interface RecentReportRow {
  id: string
  week_start: string
  week_end: string
  status: 'draft' | 'published'
  overall_impact: '위기' | '기회' | '관망' | null
  summary: string | null
  generated_at: string
}

const IMPACT_STYLE: Record<string, string> = {
  위기: 'bg-destructive/10 text-destructive',
  기회: 'bg-positive-soft text-positive',
  관망: 'bg-muted text-muted-foreground',
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
    .select('id, week_start, week_end, status, overall_impact, summary, generated_at')
    .order('week_start', { ascending: false })
    .limit(10)

  const reports = (error ? [] : (data as RecentReportRow[] | null)) ?? []

  return (
    <div className="space-y-10">
      <AdminPageHeader />

      <AdminCompetitorWeeklyGenerate />

      <AdminCompetitorWeeklyAnalyze />

      <AdminCompetitorWeeklySchedule />

      <div>
        <AdminSectionHeader icon={ListChecks} title="최근 리포트" hint="최신 10건 (초안 포함)" />
        {error && error.code === '42P01' ? (
          <AdminEmptyState message="주간 리포트 테이블이 아직 준비되지 않았습니다 (SQL 미적용)." className="p-8 rounded-lg" />
        ) : reports.length === 0 ? (
          <AdminEmptyState message="아직 생성된 주간 리포트가 없습니다." className="p-8 rounded-lg" />
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {r.week_start} ~ {r.week_end}
                    </span>
                    <span className={cn(
                      'text-xs rounded px-1.5 py-0.5 font-medium',
                      r.status === 'published' ? 'bg-positive-soft text-positive' : 'bg-muted text-muted-foreground'
                    )}>
                      {r.status === 'published' ? '발행됨' : '초안'}
                    </span>
                    {r.overall_impact && (
                      <span className={cn('text-xs rounded px-1.5 py-0.5 font-medium', IMPACT_STYLE[r.overall_impact])}>
                        {r.overall_impact}
                      </span>
                    )}
                  </div>
                  {r.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{stripLlmArtifacts(r.summary)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
