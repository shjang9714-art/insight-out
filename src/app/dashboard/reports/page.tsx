import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { FileText } from 'lucide-react'
import PageContainer from '@/components/PageContainer'
import ContentsL2Tabs from '@/components/nav/ContentsL2Tabs'
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
          {/* 제목 블록 — ContentsBoard(영상·뉴스·기술 블로그·전문기관 보고서)와 같은
              마크업·톤으로 맞춰, 아래 ContentsL2Tabs가 다른 목록 화면과 동일한
              세로 위치에 오게 한다. view='ai'만 ContentsBoard를 안 쓰다 보니
              이 블록이 없어 탭이 메인 네비 바로 밑에 붙는 어긋남이 있었다. */}
          <div className="mb-5">
            <h1 className="text-lg font-bold text-foreground">AI 리포트</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              전략보고서·지식보고서를 함께 모은 AI 리포트
            </p>
          </div>

          {/* view='external'은 ContentsBoard가 자체적으로 렌더하므로 여기서는
              view='ai'(자체 렌더, ContentsBoard 미사용)에서만 별도로 붙인다 —
              둘 다 붙이면 external에서 중복 렌더된다. */}
          <Suspense fallback={null}>
            <ContentsL2Tabs />
          </Suspense>
          <Suspense fallback={<ReportGridSkeleton />}>
            <AiReportBoard />
          </Suspense>
        </>
      )}
      {view === 'external' && (
        <Suspense fallback={<ReportGridSkeleton />}>
          <ContentsBoard fixedCategory="리서치" title="전문기관 보고서" />
        </Suspense>
      )}
    </PageContainer>
  )
}
