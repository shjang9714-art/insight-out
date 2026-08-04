import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { FileText } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import AiReportBoardCard from '@/components/reports/AiReportBoardCard'
import type { ReportViewId } from '@/components/reports/ReportTabs'
import ContentsBoard from '@/components/contents/ContentsBoard'
import { getAiReportBoardItems } from '@/lib/reports/ai-report-board'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 리포트 | Insight Out',
  description: 'AI가 분석한 전략보고서와 지식보고서를 한곳에서 확인합니다.',
}

type SearchParams = Promise<{ view?: string }>

const VALID_VIEWS: ReportViewId[] = ['ai', 'external', 'knowledge']

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

// 지시서 2026-08-04c — 자료실 "AI 리포트" 탭. 전략보고서(ai_reports)와 지식보고서
// (contents category='지식보고서')를 getAiReportBoardItems가 한 목록으로 병합해
// 발행일순으로 넘겨준다. 탭은 쪼개지 않고 카드마다 종류 배지로만 구분한다
// (AiReportBoardCard). 리포트 L1이 있던 자리를 자료실의 이 탭이 대신한다.
async function AiReportBoard() {
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

  const items = await getAiReportBoardItems(supabase)

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-16 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">발행된 AI 리포트가 아직 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <AiReportBoardCard key={`${item.kind}-${item.id}`} item={item} />
      ))}
    </div>
  )
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const rawView = typeof params.view === 'string' ? params.view : ''
  const view: ReportViewId = VALID_VIEWS.includes(rawView as ReportViewId)
    ? rawView as ReportViewId
    : 'ai'

  // 'knowledge'는 자료실 "AI 리포트"로 흡수됐다(지시서 2026-08-04c) — 옛 URL
  // (/dashboard/reports?view=knowledge)로 들어와도 404 대신 병합 화면으로 보낸다.
  if (view === 'knowledge') {
    redirect('/dashboard/reports?view=ai')
  }

  return (
    <PageContainer>
      {view === 'ai' && (
        <>
          <p className="mb-8 text-sm text-muted-foreground">
            전략보고서·지식보고서를 함께 모은 AI 리포트
          </p>
          <Suspense fallback={<ReportGridSkeleton />}>
            <AiReportBoard />
          </Suspense>
        </>
      )}
      {view === 'external' && (
        <Suspense fallback={<ReportGridSkeleton />}>
          <ContentsBoard fixedCategory="리서치" title="컨설팅 리포트" />
        </Suspense>
      )}
    </PageContainer>
  )
}
