import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { FileText } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import ReportCard from '@/components/reports/ReportCard'
import { getPublishedReports } from '@/lib/reports/query'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '전략보고서 | Insight Out',
  description: 'AI가 분석한 시장동향·경쟁사분석 전략보고서',
}

function ReportGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="aspect-[21/9] bg-muted animate-pulse" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

async function ReportsContent() {
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

  const reports = await getPublishedReports(supabase)

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-16 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">발행된 전략보고서가 아직 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((r) => (
        <ReportCard
          key={r.id}
          id={r.id}
          title={r.title}
          summary={r.summary}
          coverImageUrl={r.cover_image_url}
          publisher={r.publisher}
          publishedAt={r.published_at}
          type={r.type}
          keywords={r.keywords}
        />
      ))}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <PageContainer>
      <p className="mb-8 text-sm text-muted-foreground">
        AI가 분석한 시장동향·경쟁사 전략보고서 모음
      </p>

      <Suspense fallback={<ReportGridSkeleton />}>
        <ReportsContent />
      </Suspense>
    </PageContainer>
  )
}
