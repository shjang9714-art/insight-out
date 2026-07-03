import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { FileText, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiReport, AiReportType, AiReportStatus } from '@/lib/types'
import PageContainer from '@/components/PageContainer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '전략보고서 | Insight Out',
  description: 'AI가 분석한 시장동향·경쟁사분석 전략보고서',
}

const TYPE_STYLE: Record<AiReportType, string> = {
  '시장동향':   'bg-blue-50 text-blue-700 border-blue-200',
  '경쟁사분석': 'bg-red-50 text-red-700 border-red-200',
  '키워드분석': 'bg-violet-50 text-violet-700 border-violet-200',
  '서비스리포트': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '자유주제':   'bg-muted text-muted-foreground border-border',
}

const STATUS_LABEL: Record<AiReportStatus, string> = {
  draft:      '초안',
  generating: '생성 중',
  completed:  '완료',
  failed:     '실패',
}

const STATUS_STYLE: Record<AiReportStatus, string> = {
  draft:      'text-muted-foreground',
  generating: 'text-amber-600',
  completed:  'text-emerald-600',
  failed:     'text-red-500',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default async function ReportsPage() {
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

  const { data } = await supabase
    .from('ai_reports')
    .select('id, title, type, status, created_at')
    .order('created_at', { ascending: false })

  const reports = (data ?? []) as Pick<AiReport, 'id' | 'title' | 'type' | 'status' | 'created_at'>[]

  return (
    <PageContainer>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">전략보고서</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI가 분석한 시장동향·경쟁사 전략보고서 모음
          </p>
        </div>
        <Link
          href="/dashboard/reports/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          새 보고서
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">아직 보고서가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            관심 토픽·이슈를 골라 전략보고서를 시작하세요.
          </p>
          <Link
            href="/dashboard/issues"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            AI 인사이트로 이동 →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/reports/${r.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-600/30 hover:bg-accent/40"
            >
              <FileText className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    TYPE_STYLE[r.type]
                  )}>
                    {r.type}
                  </span>
                  <span className={cn('text-[11px]', STATUS_STYLE[r.status])}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
