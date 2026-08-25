import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { CalendarDays, ExternalLink, FileText, Building2, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiReportType } from '@/lib/types'
import ReportMarkdown from '@/components/reports/ReportMarkdown'
import PrintButton from '@/components/reports/PrintButton'
import BackLink from '@/components/BackLink'
import LoginGatedActions from '@/components/contents/LoginGatedActions'
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
  const title = report?.published_at ? report.title : 'AI 리포트'
  return { title: `${title} | Insight Out` }
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createSupabase(await cookies())

  const report = await getReport(supabase, id)

  // 574 — 열람 권한은 RLS 가 정확히 판정한다(본인 것 OR published_at 있음 OR admin).
  // 코드에서 published_at 을 다시 보면 본인이 방금 만든 미발행 보고서를 본인이 못 연다.
  if (!report) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = Boolean(user)

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
    /* 349: 보고서 본문 폭 max-w-5xl(1024px) — 표·인용이 있는 지면에 맞춘다(David 결정) */
    <PageContainer className="print:px-0 print:py-0">
    <div className="io-report mx-auto w-full max-w-5xl print:max-w-none">
      {/* 뒤로 + PDF 버튼 */}
      <div className="print:hidden mb-6 flex items-center justify-between">
        <BackLink
          fallbackHref="/dashboard/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        />
        <div className="flex items-center gap-2">
          <LoginGatedActions isLoggedIn={isLoggedIn} reportId={report.id} />
          <PrintButton />
        </div>
      </div>

      {/* 349: 표지(유형·발행 메타 → 제목 → 리드)와 본문을 하나의 지면으로 합친다.
          제목이 카드 밖과 본문 안에 따로 있으면 인쇄·PDF에서 두 문서처럼 보인다. */}
      <div className={cn(
        'rounded-2xl border border-border bg-card p-8 print:border-0 print:bg-white print:p-0',
        report.cover_image_url ? 'sm:p-12' : 'sm:px-12 sm:py-9',
      )}>
        <header className={cn(
          'border-b-2 border-foreground pb-6',
          report.cover_image_url ? 'mb-10' : 'mb-8',
        )}>
          {report.cover_image_url && (
            <div className="mb-6 aspect-[21/9] w-full overflow-hidden rounded-xl bg-muted print:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={report.cover_image_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className={cn(
              'rounded-full border px-3 py-1 text-[13px] font-medium',
              TYPE_STYLE[report.type]
            )}>
              {report.type}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {report.published_at
                ? formatDate(report.published_at)
                : `${formatDate(report.created_at)} 작성 · 미발행`}
            </span>
            {report.publisher && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {report.publisher}
              </span>
            )}
          </div>

          <h1 className="text-[30px] font-bold leading-[1.3] tracking-tight text-foreground sm:text-[34px]">
            {report.title}
          </h1>

          {report.keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 print:hidden">
              {report.keywords.map((keyword) => (
                <Link
                  key={keyword}
                  href={`/dashboard/keywords/${encodeURIComponent(keyword)}`}
                  prefetch={false}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/30 dark:hover:text-brand-300"
                >
                  #{keyword}
                </Link>
              ))}
            </div>
          )}

          {reportSummary && (
            <p className="mt-4 text-[17px] leading-[1.8] text-muted-foreground">
              {reportSummary}
            </p>
          )}
        </header>

        {/* 본문 */}
        {sanitizedHtml ? (
          <div
            className={cn(
              'io-report-body',
              '[&_h2]:text-[24px] [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mb-4 [&_h2]:mt-12 [&_h2]:first:mt-0 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-2.5',
              '[&_h3]:text-[19px] [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-7',
              '[&_h4]:text-[17px] [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mb-2 [&_h4]:mt-5',
              '[&_p]:text-[16px] [&_p]:text-foreground/90 [&_p]:leading-[1.85] [&_p]:mb-4',
              '[&_strong]:font-semibold [&_strong]:text-foreground',
              '[&_ul]:mb-5 [&_ul]:space-y-2.5',
              '[&_ol]:mb-5 [&_ol]:space-y-2.5',
              '[&_li]:text-[16px] [&_li]:text-foreground/90 [&_li]:leading-[1.8]',
              '[&_li_strong]:text-foreground',
              '[&_blockquote]:border-l-[3px] [&_blockquote]:border-brand-600 [&_blockquote]:pl-5 [&_blockquote]:py-1 [&_blockquote]:my-5',
              '[&_blockquote_p]:text-[16px] [&_blockquote_p]:text-muted-foreground [&_blockquote_p]:mb-0',
              '[&_table]:w-full [&_table]:text-[15px] [&_table]:border-collapse [&_table]:my-6',
              '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:align-top',
              '[&_td]:border [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:leading-[1.75] [&_td]:text-foreground/90 [&_td]:align-top',
              '[&_tr:nth-child(even)_td]:bg-muted/30',
              '[&_hr]:border-border [&_hr]:my-8',
              '[&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2',
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : bodyMarkdown ? (
          <ReportMarkdown>{bodyMarkdown}</ReportMarkdown>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />
            보고서 본문이 없습니다.
          </div>
        )}

        {/* 근거 — 349: 본문과 같은 지면 안에 둔다(각주처럼) */}
        {(linkedContents.length > 0 || linkedIssues.length > 0) && (
        <div className="mt-12 border-t-2 border-foreground/80 pt-6">
          <h2 className="mb-4 inline-flex items-center gap-1.5 text-[17px] font-bold text-foreground">
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            근거
          </h2>

          {/* 관련 이슈 */}
          {linkedIssues.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">이슈</p>
              <div className="flex flex-wrap gap-2">
                {linkedIssues.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/dashboard/issues/${issue.id}`}
                    prefetch={false}
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
      </div>
    </div>
    </PageContainer>
  )
}
