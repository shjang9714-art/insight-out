import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ArrowLeft, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiReport, AiReportType, AiReportStatus } from '@/lib/types'
import ReportEditor from '@/components/reports/ReportEditor'
import ReportMarkdown from '@/components/reports/ReportMarkdown'
import PrintButton from '@/components/reports/PrintButton'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const TYPE_STYLE: Record<AiReportType, string> = {
  '시장동향':   'bg-blue-50 text-blue-700 border-blue-200',
  '경쟁사분석': 'bg-red-50 text-red-700 border-red-200',
  '키워드분석': 'bg-violet-50 text-violet-700 border-violet-200',
  '서비스리포트': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '자유주제':   'bg-muted text-muted-foreground border-border',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data } = await supabase.from('ai_reports').select('title').eq('id', id).single()
  const title = (data as { title?: string } | null)?.title ?? '전략보고서'
  return { title: `${title} | Insight Out` }
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { data: reportData } = await supabase
    .from('ai_reports')
    .select('id, user_id, title, type, status, prompt, body_md, created_at')
    .eq('id', id)
    .single()

  if (!reportData) notFound()

  const report = reportData as Pick<AiReport, 'id' | 'user_id' | 'title' | 'type' | 'status' | 'prompt' | 'body_md' | 'created_at'>
  const isOwner = user?.id === report.user_id

  // ─── 근거 출처 ──────────────────────────────────────────────────────────────
  const { data: sourcesData } = await supabase
    .from('ai_report_sources')
    .select('content_id, contents(id, title)')
    .eq('ai_report_id', id)

  interface SourceRow {
    content_id: string | null
    contents: { id: string; title: string } | null
  }
  const sources = (sourcesData ?? []) as unknown as SourceRow[]
  const linkedContents = sources
    .map((s) => s.contents)
    .filter((c): c is { id: string; title: string } => c !== null)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:px-0 print:py-0 print:max-w-none">
      {/* 뒤로 + PDF 버튼 */}
      <div className="print:hidden mb-6 flex items-center justify-between">
        <Link
          href="/dashboard/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          전략보고서로
        </Link>
        <PrintButton />
      </div>

      {/* 헤더 */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            TYPE_STYLE[report.type]
          )}>
            {report.type}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(report.created_at)}</span>
        </div>
        <h1 className="text-xl font-bold text-foreground leading-snug">{report.title}</h1>
        {report.prompt && (
          <p className="text-sm text-muted-foreground">{report.prompt}</p>
        )}
      </div>

      {/* 본문 */}
      {isOwner ? (
        <ReportEditor
          reportId={report.id}
          initialTitle={report.title}
          initialBodyMd={report.body_md ?? null}
          initialStatus={report.status as AiReportStatus}
        />
      ) : report.body_md ? (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 print:border-0 print:bg-white print:p-0 print:shadow-none">
          <ReportMarkdown>{report.body_md}</ReportMarkdown>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />
          보고서 본문이 없습니다.
        </div>
      )}

      {/* 근거 콘텐츠 */}
      {linkedContents.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">근거 콘텐츠</h2>
          <ul className="space-y-2">
            {linkedContents.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-brand-600/50">↗</span>
                <Link
                  href={`/dashboard/contents/${c.id}`}
                  className="text-sm text-brand-600 hover:underline leading-snug"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
