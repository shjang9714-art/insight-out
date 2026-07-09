import { notFound } from 'next/navigation'
import BackLink from '@/components/BackLink'
import type { Metadata } from 'next'
import { ExternalLink, Download, FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportSignedUrl } from '@/lib/contents/report-url'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import ContentArticleView from '@/components/contents/ContentArticleView'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import {
  CONTENT_STATUS_TONE,
  CONTENT_STATUS_LABEL,
  REVIEW_REASON_LABEL,
} from '@/lib/admin/status-style'
import { CONTENT_CATEGORY_LABEL, type ContentCategory, type ContentStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface AdminContentDetail {
  id: string
  title: string
  title_original: string | null
  category: ContentCategory
  status: ContentStatus
  review_reason: string | null
  summary_ko: string | null
  body_original: string | null
  body_translated_ko: string | null
  original_language: string | null
  body_fetched_at: string | null
  body_len: number | null
  file_path: string | null
  original_url: string | null
  author: string | null
  published_at: string | null
  collected_at: string
  sources: { name: string } | null
  content_services: { services: { name: string } | null }[]
  content_keywords: { keywords: { name: string } | null }[]
}

const SELECT_COLS = `
  id, title, title_original, category, status, review_reason,
  summary_ko, body_original, body_translated_ko, original_language,
  body_fetched_at, body_len, file_path, original_url, author,
  published_at, collected_at,
  sources(name),
  content_services(services(name)),
  content_keywords(keywords(name))
`

const SELECT_COLS_FALLBACK = `
  id, title, title_original, category, status,
  summary_ko, body_original, body_translated_ko, original_language,
  body_fetched_at, file_path, original_url, author,
  published_at, collected_at,
  sources(name),
  content_services(services(name)),
  content_keywords(keywords(name))
`

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function bodyStateLabel(bodyFetchedAt: string | null, bodyLen: number | null, bodyLenAvailable: boolean): string {
  if (!bodyFetchedAt) return '미수집'
  if (!bodyLenAvailable || bodyLen == null) return '수집됨(길이 미확인)'
  return bodyLen >= 400 ? '풀본문' : '스니펫'
}

async function fetchContent(id: string): Promise<{ content: AdminContentDetail | null; bodyLenAvailable: boolean }> {
  const admin = createAdminClient()

  const first = await admin.from('contents').select(SELECT_COLS).eq('id', id).single()
  if (first.error?.code === '42703') {
    const fallback = await admin.from('contents').select(SELECT_COLS_FALLBACK).eq('id', id).single()
    if (fallback.error || !fallback.data) return { content: null, bodyLenAvailable: false }
    return {
      content: { ...(fallback.data as unknown as AdminContentDetail), review_reason: null, body_len: null },
      bodyLenAvailable: false,
    }
  }
  if (first.error || !first.data) return { content: null, bodyLenAvailable: true }
  return { content: first.data as unknown as AdminContentDetail, bodyLenAvailable: true }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const { content } = await fetchContent(id)
  const title = content?.title ?? '콘텐츠 상세'
  return {
    title: `${title} | 어드민`,
    description: title,
  }
}

export default async function AdminContentDetailPage({ params }: PageProps) {
  const { id } = await params
  const { content, bodyLenAvailable } = await fetchContent(id)

  if (!content) {
    notFound()
  }

  const isReport = Boolean(content.file_path)
  let signedUrl: string | null = null
  let isPdf = false
  if (isReport) {
    signedUrl = await getReportSignedUrl(content.file_path!)
    isPdf = content.file_path!.toLowerCase().endsWith('.pdf')
  }

  const serviceNames = content.content_services
    .map((cs) => cs.services?.name)
    .filter(Boolean) as string[]
  const keywordNames = content.content_keywords
    .map((ck) => ck.keywords?.name)
    .filter(Boolean) as string[]

  const displayAt =
    (content.category === '리포트' || content.category === 'AI보고서')
      ? content.collected_at
      : (content.published_at ?? content.collected_at)
  const dateStr = formatDate(displayAt)

  const bodyKo =
    content.original_language === 'en' && content.body_translated_ko
      ? content.body_translated_ko
      : cleanBodyText(htmlToPlainText(content.body_original ?? ''))

  return (
    <div className="mx-auto max-w-6xl">
      {/* 뒤로가기 */}
      <div className="mb-6">
        <BackLink
          fallbackHref="/admin/contents"
          className="inline-flex items-center gap-1.5 admin-caption text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 기사 본문 */}
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <ContentArticleView
            title={content.title}
            category={content.category}
            sourceName={content.sources?.name ?? null}
            author={content.author}
            dateLabel={dateStr ? `발행 ${dateStr}` : '발행일 미상'}
            originalLanguage={content.original_language}
            serviceNames={serviceNames}
            keywordNames={keywordNames}
          >
            {isReport ? (
              <>
                {content.summary_ko && (
                  <p className="mb-6 admin-body text-muted-foreground">{content.summary_ko}</p>
                )}
                {signedUrl && isPdf ? (
                  <div>
                    <iframe
                      src={signedUrl}
                      className="w-full rounded-lg border border-border"
                      style={{ height: '80vh' }}
                      title={content.title}
                    />
                    <div className="mt-3 flex justify-end">
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 admin-btn-text text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        새 탭에서 열기
                      </a>
                    </div>
                  </div>
                ) : signedUrl && !isPdf ? (
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <p className="admin-body text-muted-foreground">이 파일은 미리보기를 지원하지 않습니다.</p>
                    <a
                      href={signedUrl}
                      download
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 admin-btn-text text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                    >
                      <Download className="h-4 w-4" />
                      파일 다운로드
                    </a>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center admin-body text-muted-foreground">
                    파일을 불러올 수 없습니다.
                  </div>
                )}
              </>
            ) : bodyKo ? (
              <p className="whitespace-pre-wrap admin-body text-foreground">{bodyKo}</p>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5 text-center">
                <p className="admin-body text-muted-foreground">본문 미수집 콘텐츠입니다. 원문 보기로 확인하세요.</p>
              </div>
            )}
          </ContentArticleView>
        </div>

        {/* 수집 정보 패널 */}
        <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-6">
          <h2 className="admin-section-title text-foreground">수집 정보</h2>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={CONTENT_STATUS_TONE[content.status]} label={CONTENT_STATUS_LABEL[content.status]} />
            {content.status === 'pending' && content.review_reason && (
              <span
                title={`검토 대기 사유: ${REVIEW_REASON_LABEL[content.review_reason] ?? content.review_reason}`}
                className="rounded bg-risk-soft px-1.5 py-0.5 admin-caption font-medium text-risk"
              >
                {REVIEW_REASON_LABEL[content.review_reason] ?? content.review_reason}
              </span>
            )}
          </div>

          <dl className="space-y-3 admin-caption">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">소스</dt>
              <dd className="text-right font-medium text-foreground">{content.sources?.name ?? 'Google News 검색'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">카테고리</dt>
              <dd className="text-right font-medium text-foreground">{CONTENT_CATEGORY_LABEL[content.category] ?? content.category}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">수집일</dt>
              <dd className="text-right font-medium text-foreground">{formatDateTime(content.collected_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">발행일</dt>
              <dd className="text-right font-medium text-foreground">
                {content.published_at ? formatDateTime(content.published_at) : '미상'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">본문 상태</dt>
              <dd className="text-right font-medium text-foreground">
                {bodyStateLabel(content.body_fetched_at, content.body_len, bodyLenAvailable)}
              </dd>
            </div>
            {content.body_fetched_at && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">본문 수집 시각</dt>
                <dd className="text-right font-medium text-foreground">{formatDateTime(content.body_fetched_at)}</dd>
              </div>
            )}
          </dl>

          {content.original_url && (
            <a
              href={`/api/contents/${content.id}/source`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 admin-btn-text text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              <ExternalLink className="h-4 w-4" />
              원문 열기
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}
