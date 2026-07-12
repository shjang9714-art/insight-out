import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiReportType } from '@/lib/types'
import ReportMarkdown from '@/components/reports/ReportMarkdown'
import PrintButton from '@/components/reports/PrintButton'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import { getReport } from '@/lib/reports/query'
import { sanitizeReportHtml } from '@/lib/reports/sanitize-html'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

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

function createSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = createSupabase(await cookies())
  const report = await getReport(supabase, id)
  const title = report?.published_at ? report.title : '전략보고서'
  return { title: `${title} | Insight Out` }
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createSupabase(await cookies())

  const report = await getReport(supabase, id)

  // 275 — 서비스는 발행된(published_at not null) 보고서만 열람 가능(어드민 미리보기는 276)
  if (!report || !report.published_at) notFound()

  // ─── 근거 출처 ──────────────────────────────────────────────────────────────
  const { data: sourcesData } = await supabase
    .from('ai_report_sources')
    .select('content_id, issue_id, contents(id, title, original_url, published_at, sources(name)), issues(id, title)')
    .eq('ai_report_id', id)

  interface SourceContentDetail {
    id: string
    title: string
    original_url: string | null
    published_at: string | null
    sources: { name: string } | null
  }
  interface SourceIssueDetail {
    id: string
    title: string
  }
  interface SourceRow {
    content_id: string | null
    issue_id: string | null
    contents: SourceContentDetail | null
    issues: SourceIssueDetail | null
  }
  const sources = (sourcesData ?? []) as unknown as SourceRow[]
  const linkedContents = sources
    .filter(s => s.contents !== null)
    .map(s => s.contents!)
  const linkedIssues = sources
    .filter(s => s.issues !== null && s.contents === null)
    .map(s => s.issues!)

  const reportSummary = report.summary ? stripLlmArtifacts(report.summary) : null
  const sanitizedHtml = report.body_html ? sanitizeReportHtml(stripLlmArtifacts(report.body_html)) : null
  const bodyMarkdown = report.body_md ? stripLlmArtifacts(report.body_md) : null

  return (
    <PageContainer variant="reading" className="print:px-0 print:py-0 print:max-w-none">
      {/* 뒤로 + PDF 버튼 */}
      <div className="print:hidden mb-6 flex items-center justify-between">
        <BackLink
          fallbackHref="/dashboard/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        />
        <PrintButton />
      </div>

      {/* 헤더 */}
      <div className="mb-8 space-y-3">
        {report.cover_image_url && (
          <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted print:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.cover_image_url}
              alt={report.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            TYPE_STYLE[report.type]
          )}>
            {report.type}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(report.published_at)}</span>
          {report.publisher && (
            <span className="text-xs text-muted-foreground">· {report.publisher}</span>
          )}
        </div>
        <h1 className="text-xl font-bold text-foreground leading-snug">{report.title}</h1>
        {reportSummary && (
          <p className="text-sm text-muted-foreground">{reportSummary}</p>
        )}
      </div>

      {/* 본문 */}
      {sanitizedHtml ? (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 print:border-0 print:bg-white print:p-0 print:shadow-none">
          <div
            className={cn(
              '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1.5',
              '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4',
              '[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mb-2 [&_h4]:mt-3',
              '[&_p]:text-sm [&_p]:text-foreground/90 [&_p]:leading-relaxed [&_p]:mb-3',
              '[&_strong]:font-semibold [&_strong]:text-foreground',
              '[&_em]:italic [&_em]:text-foreground/80',
              '[&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1',
              '[&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1',
              '[&_li]:text-sm [&_li]:text-foreground/90 [&_li]:leading-relaxed',
              '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-600/40 [&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:my-3',
              '[&_blockquote_p]:text-sm [&_blockquote_p]:text-muted-foreground [&_blockquote_p]:italic [&_blockquote_p]:mb-0',
              '[&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:mb-4',
              '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground',
              '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-foreground/90',
              '[&_tr:nth-child(even)_td]:bg-muted/40',
              '[&_hr]:border-border [&_hr]:my-6',
              '[&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2',
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      ) : bodyMarkdown ? (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 print:border-0 print:bg-white print:p-0 print:shadow-none">
          <ReportMarkdown>{bodyMarkdown}</ReportMarkdown>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />
          보고서 본문이 없습니다.
        </div>
      )}

      {/* 근거 */}
      {(linkedContents.length > 0 || linkedIssues.length > 0) && (
        <div className="mt-8 print:mt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">근거</h2>

          {/* 관련 이슈 */}
          {linkedIssues.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">이슈</p>
              <div className="flex flex-wrap gap-2">
                {linkedIssues.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/dashboard/issues/${issue.id}`}
                    className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand-600/40 hover:text-brand-600"
                  >
                    {stripLlmArtifacts(issue.title)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 콘텐츠 카드 */}
          {linkedContents.length > 0 && (
            <ul className="space-y-2">
              {linkedContents.map((c) => {
                const sourceName = Array.isArray(c.sources)
                  ? (c.sources as { name: string }[])[0]?.name
                  : c.sources?.name
                const displayDate = c.published_at
                  ? new Date(c.published_at).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
                    })
                  : null
                return (
                  <li key={c.id}>
                    {c.original_url ? (
                      <a
                        href={c.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-brand-600/30"
                      >
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 print:hidden" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground group-hover:text-brand-600 leading-snug line-clamp-1">
                            {c.title}
                          </span>
                          {(sourceName || displayDate) && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                              {sourceName && <span>{sourceName}</span>}
                              {sourceName && displayDate && <span>·</span>}
                              {displayDate && <span>{displayDate}</span>}
                            </div>
                          )}
                        </div>
                      </a>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <span className="mt-0.5 shrink-0 text-brand-600/50">↗</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground leading-snug line-clamp-1">{c.title}</span>
                          {(sourceName || displayDate) && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                              {sourceName && <span>{sourceName}</span>}
                              {sourceName && displayDate && <span>·</span>}
                              {displayDate && <span>{displayDate}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </PageContainer>
  )
}
