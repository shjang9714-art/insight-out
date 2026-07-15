import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import EntityTabs from '@/components/entities/EntityTabs'
import CompetitorWeeklyReport from '@/components/entities/CompetitorWeeklyReport'
import CompetitorWeeklyTimeline from '@/components/entities/CompetitorWeeklyTimeline'
import {
  getCompetitorWeeklyReportByWeek,
  getCompetitorWeeklyTimeline,
} from '@/lib/competitor-weekly/query'

export const dynamic = 'force-dynamic'

type Params = Promise<{ week: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { week } = await params
  return {
    title: `${week} 경쟁사 동향 브리핑 | Insight Out`,
    description: '사업영역별 경쟁사 동향 종합과 LG U+ 관점 위기·기회 분석.',
  }
}

/** 261 — 과거 주간 경쟁 리포트 열람(타임라인 클릭 진입) */
export default async function CompetitorWeeklyDetailPage({ params }: { params: Params }) {
  const { week } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const [report, timeline] = await Promise.all([
    getCompetitorWeeklyReportByWeek(supabase, week),
    getCompetitorWeeklyTimeline(supabase, 12),
  ])

  if (!report) notFound()

  return (
    <PageContainer>
      <Link
        href="/dashboard/entities?view=trend"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        기업동향으로 돌아가기
      </Link>

      <EntityTabs value="trend" />

      <div className="space-y-4">
        <CompetitorWeeklyReport report={report} />
        <CompetitorWeeklyTimeline entries={timeline} activeWeekStart={report.week_start} />
      </div>
    </PageContainer>
  )
}
