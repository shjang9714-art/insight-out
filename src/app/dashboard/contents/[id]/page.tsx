import { Suspense, cache } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import Image from 'next/image'
import { ExternalLink, Download, FileText } from 'lucide-react'
import LoginGatedActions from '@/components/contents/LoginGatedActions'
import CouncilDiscussButton from '@/components/dashboard/CouncilDiscussButton'
import TranslatedArticle from '@/components/contents/TranslatedArticle'
import RecordRecentView from '@/components/contents/RecordRecentView'
import RecordActiveCategoryHint from '@/components/contents/RecordActiveCategoryHint'
import ViewTracker from '@/components/contents/ViewTracker'
import BackLink from '@/components/BackLink'
import EntityTabs from '@/components/entities/EntityTabs'
import ArticleBodyLoader from '@/components/contents/ArticleBodyLoader'
import ContentArticleView from '@/components/contents/ContentArticleView'
import ReportMarkdown from '@/components/reports/ReportMarkdown'
import ReportBodyTabs from '@/components/contents/ReportBodyTabs'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { getReportSignedUrl } from '@/lib/contents/report-url'
import { buildReportDownloadName } from '@/lib/contents/report-filename'
import { getRelatedGrouped, getRelatedYoutube } from '@/lib/contents/related'
import { getContentCitations } from '@/lib/contents/citations'
import CitationsBlock from '@/components/contents/CitationsBlock'
import { getPublishedCompanyDocuments } from '@/lib/company-docs/query'
import CompanyDocumentCard from '@/components/entities/CompanyDocumentCard'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import FeedCarousel from '@/components/feed/FeedCarousel'
import { CONTENT_CATEGORY_LABEL, ENTITY_TYPE_LABEL, type ContentCategory, type EntityType } from '@/lib/types'
import PageContainer from '@/components/PageContainer'
import { cn } from '@/lib/utils'
import { extractVideoId } from '@/lib/youtube'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ origin?: string; view?: string; category?: string }>
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentDetail {
  id: string
  title: string
  title_original: string | null
  category: ContentCategory
  summary_ko: string | null
  body_original: string | null
  body_translated_ko: string | null
  original_language: string | null
  body_fetched_at: string | null
  file_path: string | null
  original_url: string | null
  author: string | null
  published_at: string | null
  collected_at: string
  sources: { name: string } | null
  content_keywords: { keywords: { name: string } | null }[]
  matched_keywords: string[] | null
  matched_groups: string[] | null
  cluster_id: string | null
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 border-blue-100',
  '리포트':    'bg-purple-50 text-purple-700 border-purple-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  'AI보고서':  'bg-pink-50 text-pink-700 border-pink-100',
  '지식보고서': 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
  '기업자료':  'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
  // deprecated
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
}

// ─── 데이터 조회 (요청당 1회로 dedupe — generateMetadata/Page가 공유) ──────────
// react cache()로 감싸 동일 id 호출 시 실제 쿼리는 한 번만 나가도록 함.
// 메인 쿼리와 link_ok 가드 쿼리도 순차 대기 대신 Promise.all로 병렬 실행.
const getContentRow = cache(async (id: string) => {
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const [{ data, error }, { data: lh }, { data: md }, { data: tr }, { data: lg }] = await Promise.all([
    supabase
      .from('contents')
      .select(`
        id, title, title_original, category,
        summary_ko, body_original, body_translated_ko, original_language, body_fetched_at,
        file_path, original_url, author, published_at, collected_at,
        matched_keywords, matched_groups, cluster_id,
        sources(name),
        content_keywords(keywords(name))
      `)
      .eq('id', id)
      .eq('status', 'published')
      .single(),
    // 별도 가드 쿼리: link_ok(컬럼 없으면 null→정상 링크 표시, 42703 graceful)
    supabase.from('contents').select('link_ok').eq('id', id).single(),
    // 별도 가드 쿼리: body_markdown(212, 컬럼 없으면 null→기존 평문 렌더, 42703 graceful)
    supabase.from('contents').select('body_markdown').eq('id', id).single(),
    // 별도 가드 쿼리: 유튜브 자막(265, 컬럼 없으면 null→스크립트 섹션 생략, 42703 graceful)
    supabase.from('contents').select('transcript, transcript_ko, transcript_lang').eq('id', id).single(),
    // 별도 가드 쿼리: lgu_impact(313, 컬럼 없으면 null→배지 생략, 42703 graceful)
    supabase.from('contents').select('lgu_impact').eq('id', id).single(),
  ])

  const linkDead = (lh as { link_ok: boolean | null } | null)?.link_ok === false
  const bodyMarkdown = (md as { body_markdown: string | null } | null)?.body_markdown ?? null
  const transcriptRow = tr as { transcript: string | null; transcript_ko: string | null; transcript_lang: string | null } | null
  const lguImpact = (lg as { lgu_impact: string | null } | null)?.lgu_impact ?? null

  return { data, error, linkDead, bodyMarkdown, transcriptRow, lguImpact, supabase }
})

// ─── 메타데이터 ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const { data } = await getContentRow(id)

  const title = data?.title ?? '콘텐츠 상세'
  return {
    title: `${title} | Insight Out`,
    description: title,
  }
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function ContentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { origin, view, category: originCategory } = await searchParams
  const { data, error, linkDead, bodyMarkdown, transcriptRow, lguImpact, supabase } = await getContentRow(id)
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const isLoggedIn = Boolean(authUser)

  if (error || !data) {
    notFound()
  }

  const content = data as unknown as ContentDetail

  // ── 리포트(file_path) vs 뉴스(original_url) vs 유튜브(임베드) 분기(252) ───────
  const isReport = Boolean(content.file_path)
  const isExternalReport = ['리포트', '가트너', 'KRG'].includes(content.category)
  const isKnowledgeReport = content.category === '지식보고서'
  const listFallback = isKnowledgeReport
    ? '/dashboard/reports?view=ai'
    : `/dashboard/contents?category=${encodeURIComponent(originCategory ?? content.category)}`
  const isYoutube = content.category === '유튜브'
  const youtubeVideoId = isYoutube ? extractVideoId(content.original_url) : null
  // 유튜브 자막 스크립트(265) — transcript_ko 있을 때만 노출, 없으면 섹션 생략
  const transcriptKo = isYoutube ? (transcriptRow?.transcript_ko ?? null) : null
  const transcriptOriginal = isYoutube ? (transcriptRow?.transcript ?? null) : null
  const transcriptLang = transcriptRow?.transcript_lang ?? null
  const hasOriginalTranscriptToggle = Boolean(
    transcriptKo && transcriptOriginal && transcriptLang && transcriptLang !== 'ko' && transcriptOriginal !== transcriptKo
  )
  const hasKoreanTranslation =
    !isYoutube &&
    content.original_language === 'en' &&
    Boolean(content.body_translated_ko)

  let signedUrl: string | null = null
  let downloadUrl: string | null = null
  let downloadFileName: string | null = null
  let isPdf = false
  let isPptx = false

  if (isReport) {
    isPdf = content.file_path!.toLowerCase().endsWith('.pdf')
    isPptx = content.file_path!.toLowerCase().endsWith('.pptx')
    downloadFileName = buildReportDownloadName(content.title, content.sources?.name ?? null, content.file_path!)
    // 비공개 버킷 서명 URL 생성 (실패 시 null → 폴백 메시지). 뷰어용과 다운로드용을 분리 —
    // 다운로드용은 Content-Disposition으로 파일명을 지정해야 해 별도 서명이 필요하다.
    const [viewerUrl, dlUrl] = await Promise.all([
      getReportSignedUrl(content.file_path!),
      getReportSignedUrl(content.file_path!, downloadFileName),
    ])
    signedUrl = viewerUrl
    downloadUrl = dlUrl
  }
  // 뉴스 분기: ensureFullBody 는 ArticleBody 안에서 스트리밍 — 이 시점엔 호출하지 않음

  const currentMeta = {
    id: content.id,
    matched_keywords: content.matched_keywords,
    matched_groups: content.matched_groups,
    cluster_id: content.cluster_id,
  }
  const youtubeHashtags = isYoutube
    ? Array.from(new Set(content.matched_groups ?? []))
        .slice(0, 5)
        .map((label) => ({ label, href: `/dashboard/topics/${encodeURIComponent(label)}` }))
    : []

  const catStyle =
    CATEGORY_STYLE[content.category] ?? 'bg-muted text-muted-foreground border-border'

  const keywordNames = content.content_keywords
    .map((ck) => ck.keywords?.name)
    .filter(Boolean) as string[]

  const displayAt =
    (content.category === '리포트' || content.category === 'AI보고서' || content.category === '지식보고서')
      ? content.collected_at
      : (content.published_at ?? content.collected_at)
  const dateStr = formatDate(displayAt)

  return (
    <PageContainer variant="reading">

      {/* 366 — 문서(PDF/PPTX) 상세는 sticky 해제(정적): PdfViewer를 가리지 않게 한다 */}
      {/* 콘텐츠(뉴스/유튜브/웹인사이트) 탭바는 DashboardHeader의 sticky L2 행과 중복이라 생략(372).
          기업동향에서 진입(origin=entities)한 경우만, 그 맥락(경쟁사 최근 뉴스 등)으로 되돌아갈
          수 있게 이 페이지 자체의 보조 탭바를 유지한다. */}
      {origin === 'entities' && !(isExternalReport || isKnowledgeReport) && (
        <div
          className={cn(
            '-mx-4 -mt-3 mb-6 bg-background/95 px-4 pb-2 backdrop-blur-sm sm:-mx-5 sm:px-5',
            !isReport && 'sticky top-14 z-10 md:top-[132px]'
          )}
        >
          <EntityTabs value={view ?? 'competitor'} />
        </div>
      )}

      {/* 뒤로가기 */}
      <div className="mb-6">
        <BackLink
          fallbackHref={listFallback}
          referrerFallback
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      <RecordRecentView id={content.id} title={content.title} category={content.category} />
      <RecordActiveCategoryHint category={content.category} />
      {isLoggedIn && <ViewTracker contentId={content.id} />}

      <article>
        {hasKoreanTranslation && !isReport ? (
          <>
            {/* 카테고리 뱃지 */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${catStyle}`}
              >
                {CONTENT_CATEGORY_LABEL[content.category] ?? content.category}
              </span>
              <LguImpactBadge impact={lguImpact} />
              {content.original_language === 'en' && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  영어 원문
                </span>
              )}
            </div>

            <TranslatedArticle
              translatedTitle={content.title}
              originalTitle={content.title_original ?? content.title}
              translatedBody={content.body_translated_ko ?? ''}
              originalBody={cleanBodyText(
                htmlToPlainText(content.body_original ?? '')
              )}
            >
              {/* 메타 + 상단 액션 */}
              <div className="mb-4 flex flex-wrap items-start justify-between gap-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {content.sources?.name && (
                    <span className="font-medium text-foreground">{content.sources.name}</span>
                  )}
                  {content.author && <span>{content.author}</span>}
                  <span>{dateStr ? `발행 ${dateStr}` : '발행일 미상'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <LoginGatedActions isLoggedIn={isLoggedIn} contentId={content.id} />
                  {content.original_url && (
                    linkDead ? (
                      <span
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed opacity-50"
                        title="원문을 찾을 수 없습니다"
                      >
                        <ExternalLink className="h-4 w-4" />
                        원문 없음
                      </span>
                    ) : (
                      <a
                        href={`/api/contents/${content.id}/source`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        원문 보기
                      </a>
                    )
                  )}
                </div>
              </div>

              {keywordNames.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                  {keywordNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      #{name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mb-6 border-t border-border" />
            </TranslatedArticle>
          </>
        ) : (
          <ContentArticleView
            title={content.title}
            category={content.category}
            sourceName={content.sources?.name ?? null}
            author={content.author}
            dateLabel={dateStr ? `발행 ${dateStr}` : '발행일 미상'}
            originalLanguage={content.original_language}
            keywordNames={keywordNames}
            hashtags={isYoutube ? youtubeHashtags : undefined}
            lguImpact={lguImpact}
            actions={
              <>
                <LoginGatedActions isLoggedIn={isLoggedIn} contentId={content.id} />
                {!isReport && content.original_url && (
                  linkDead ? (
                    <span
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed opacity-50"
                      title="원문을 찾을 수 없습니다"
                    >
                      <ExternalLink className="h-4 w-4" />
                      원문 없음
                    </span>
                  ) : (
                    <a
                      href={`/api/contents/${content.id}/source`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {isYoutube ? 'YouTube에서 보기' : '원문 보기'}
                    </a>
                  )
                )}
              </>
            }
          >
            {isYoutube ? (
              <>
                {content.summary_ko && (
                  <div className="mb-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                      주요 내용
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {content.summary_ko}
                    </p>
                  </div>
                )}
                {transcriptKo && (
                  <details className="mb-6 rounded-xl border border-border bg-card p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                      스크립트
                    </summary>
                    <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {transcriptKo}
                    </div>
                    {hasOriginalTranscriptToggle && (
                      <details className="mt-3 border-t border-border pt-3">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                          원문 보기({transcriptLang})
                        </summary>
                        <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {transcriptOriginal}
                        </div>
                      </details>
                    )}
                  </details>
                )}
                {youtubeVideoId ? (
                  <div className="mb-6 aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}`}
                      title={content.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <div className="mb-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
                    <p className="text-sm text-muted-foreground">이 영상은 인앱에서 재생할 수 없습니다.</p>
                    {content.original_url && (
                      <a
                        href={`/api/contents/${content.id}/source`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        YouTube에서 보기
                      </a>
                    )}
                  </div>
                )}
              </>
            ) : isReport ? (
              <>
                {content.summary_ko && (
                  <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {content.summary_ko}
                  </p>
                )}

                {signedUrl && isPdf && downloadUrl && downloadFileName ? (
              /* 인라인 PDF 뷰어 + 텍스트 탭 + 다운로드(307) */
                  <ReportBodyTabs
                    contentId={content.id}
                    signedUrl={signedUrl}
                    downloadUrl={downloadUrl}
                    downloadFileName={downloadFileName}
                    textBody={
                      content.body_original
                        ? cleanBodyText(htmlToPlainText(content.body_original))
                        : null
                    }
                    markdownBody={bodyMarkdown}
                  />
                ) : downloadUrl && downloadFileName && !isPdf ? (
              /* PPTX 등 PDF 외 파일: 인라인 뷰어 없이 다운로드 안내 */
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <div className="space-y-1 text-center">
                      <p className="text-sm font-medium text-foreground">
                        {isPptx ? 'PPTX 파일은 인라인 미리보기를 지원하지 않습니다.' : '이 파일은 미리보기를 지원하지 않습니다.'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isPptx ? '파일을 내려받아 PowerPoint에서 확인해주세요.' : '파일을 내려받아 확인해주세요.'}
                      </p>
                    </div>
                    <a
                      href={downloadUrl}
                      download
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                    >
                      <Download className="h-4 w-4" />
                      {isPptx ? 'PPTX 다운로드' : `${downloadFileName} 다운로드`}
                    </a>
                  </div>
                ) : (
              /* 서명 URL 생성 실패 */
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    파일을 불러올 수 없습니다.
                  </div>
                )}
              </>
            ) : bodyMarkdown ? (
              <ReportMarkdown>{bodyMarkdown}</ReportMarkdown>
            ) : (
              <ArticleBodyLoader
                contentId={content.id}
                contentTitle={content.title}
                snippet={cleanBodyText(htmlToPlainText(content.summary_ko ?? content.body_original ?? ''))}
                originalUrl={content.original_url}
              />
            )}
          </ContentArticleView>
        )}

        {/* 하단 액션 */}
        <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
          <BackLink
            fallbackHref={listFallback}
            referrerFallback
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          />

          <div className="flex items-center gap-2">
            {/* COUNCIL로 현재 맥락 토론 진입(362) — 로그인 전용 */}
            {isLoggedIn && (
              <CouncilDiscussButton
                title={content.title}
                summary={content.summary_ko}
                refType="contents"
                refId={content.id}
              />
            )}

            {/* 리포트 외(뉴스·유튜브)엔 원문 보기 링크 표시 */}
            {!isReport && content.original_url && (
              linkDead ? (
                <span
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed opacity-50"
                  title="원문을 찾을 수 없습니다"
                >
                  <ExternalLink className="h-4 w-4" />
                  원문 없음
                </span>
              ) : (
                <a
                  href={`/api/contents/${content.id}/source`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isYoutube ? 'YouTube에서 보기' : '원문 보기'}
                </a>
              )
            )}
          </div>
        </div>
      </article>

      <Suspense fallback={null}>
        <ContentSupplementSections
          supabase={supabase}
          contentId={id}
          currentMeta={currentMeta}
          category={content.category}
        />
      </Suspense>
    </PageContainer>
  )
}

type ContentMeta = {
  id: string
  matched_keywords: string[] | null
  matched_groups: string[] | null
  cluster_id: string | null
}

type EntityRow = {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
}

async function ContentSupplementSections({
  supabase,
  contentId,
  currentMeta,
  category,
}: {
  supabase: ReturnType<typeof createSupabaseClient>
  contentId: string
  currentMeta: ContentMeta
  category: ContentCategory
}) {
  const isCompanyDoc = category === '기업자료'

  const [grouped, youtubeRelated, entityRes, citations, companyDocRes] = await Promise.all([
    getRelatedGrouped(supabase, currentMeta),
    getRelatedYoutube(supabase, currentMeta),
    supabase
      .from('content_entities')
      .select('entities(id, canonical_name, entity_type, is_competitor)')
      .eq('content_id', contentId)
      .limit(20),
    getContentCitations(supabase, contentId),
    isCompanyDoc
      ? supabase
          .from('company_documents')
          .select('entity_id, entities(id, canonical_name)')
          .eq('content_id', contentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const relatedEntities: EntityRow[] = (entityRes.data ?? [])
    .map((r: unknown) => {
      const row = r as { entities: EntityRow | null }
      return row.entities
    })
    .filter((e): e is EntityRow => e !== null)

  // 355-D — 기업자료 ↔ 연결 기업(공식 entity_id) + "이 기업의 다른 자료"(자기 제외)
  const companyDocEntity = (companyDocRes.data as unknown as {
    entity_id: string | null
    entities: { id: string; canonical_name: string } | { id: string; canonical_name: string }[] | null
  } | null)
  const linkedEntity = companyDocEntity
    ? (Array.isArray(companyDocEntity.entities) ? companyDocEntity.entities[0] : companyDocEntity.entities) ?? null
    : null

  const siblingDocuments = linkedEntity
    ? (await getPublishedCompanyDocuments(supabase, { entityId: linkedEntity.id, limit: 9 }))
        .filter((doc) => doc.contentId !== contentId)
        .slice(0, 8)
    : []

  return (
    <>
      {/* 이 기사를 인용한 리포트·인사이트(313 역참조) — 비어 있으면 CitationsBlock 자체가 렌더 안 함 */}
      <CitationsBlock citations={citations} />

      {/* 355-D — 기업자료 상세: 연결 기업 링크 + 같은 기업의 다른 자료 */}
      {isCompanyDoc && linkedEntity && (
        <section className="mt-6 border-t border-border pt-5">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">연결된 기업</p>
          <Link
            href={`/dashboard/entities/${linkedEntity.id}`}
            prefetch={false}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 transition-opacity hover:opacity-75 dark:bg-brand-950/30 dark:text-brand-300"
          >
            {linkedEntity.canonical_name}
          </Link>

          {siblingDocuments.length > 0 && (
            <div className="mt-5">
              <p className="mb-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">
                이 기업의 다른 자료
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {siblingDocuments.map((doc) => (
                  <CompanyDocumentCard key={doc.contentId} doc={doc} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 관련 엔티티 칩 */}
      {relatedEntities.length > 0 && (
        <section className="mt-6 border-t border-border pt-5">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">관련 엔티티</p>
          <div className="flex flex-wrap gap-1.5">
            {relatedEntities.map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/entities/${e.id}`}
                prefetch={false}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75',
                  e.entity_type === 'tech'     && 'border-blue-200 bg-blue-50 text-blue-700',
                  e.entity_type === 'policy'   && 'border-amber-200 bg-amber-50 text-amber-700',
                  e.entity_type === 'product'  && 'border-violet-200 bg-violet-50 text-violet-700',
                  e.entity_type === 'person'   && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                  e.entity_type === 'industry' && 'border-border bg-muted text-muted-foreground',
                  e.entity_type === 'company'  && (
                    e.is_competitor
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-brand-200 bg-brand-50 text-brand-700'
                  ),
                )}
              >
                <span className="opacity-60">{ENTITY_TYPE_LABEL[e.entity_type]}</span>
                {e.canonical_name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 관련 기사 — 유형별 가로 캐러셀 */}
      {(Object.keys(grouped).length > 0 || youtubeRelated.length > 0) && (
        <section className="mt-10 space-y-7 border-t border-border pt-8">
          {(['뉴스', '리서치', '웹인사이트'] as const).map((bucket) => {
            const items = grouped[bucket]
            if (!items?.length) return null
            return (
              <div key={bucket}>
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  관련 {bucket}
                </h2>
                <FeedCarousel autoplay={false} cardWidth={260} cardHeight={116}>
                  {items.map((r) => {
                    const relDate = r.published_at ?? r.collected_at
                    const relDateStr = relDate
                      ? new Date(relDate).toLocaleDateString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                          month: 'short',
                          day: 'numeric',
                        })
                      : null
                    return (
                      <Link
                        key={r.id}
                        href={`/dashboard/contents/${r.id}`}
                        prefetch={false}
                        className="group flex h-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-600/40 hover:bg-accent/50"
                      >
                        <p className="line-clamp-2 text-sm font-medium text-foreground group-hover:text-brand-600">
                          {r.title}
                        </p>
                        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {r.sources?.name && <span>{r.sources.name}</span>}
                          {relDateStr && <span>{relDateStr}</span>}
                        </div>
                      </Link>
                    )
                  })}
                </FeedCarousel>
              </div>
            )
          })}

          {youtubeRelated.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">관련 유튜브</h2>
              <FeedCarousel autoplay={false} cardWidth={260} cardHeight={220}>
                {youtubeRelated.map((v) => {
                  const relDateStr = v.published_at
                    ? new Date(v.published_at).toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        month: 'short',
                        day: 'numeric',
                      })
                    : null
                  return (
                    <a
                      key={v.id}
                      href={`https://www.youtube.com/watch?v=${v.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex h-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-red-400/40 hover:bg-accent/50"
                    >
                      {v.thumbnail_url && (
                        <Image
                          src={v.thumbnail_url}
                          alt={v.title}
                          width={260}
                          height={120}
                          className="h-[120px] w-full rounded-lg object-cover"
                          unoptimized
                        />
                      )}
                      <p className="line-clamp-2 text-sm font-medium text-foreground group-hover:text-red-600">
                        {v.title}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{v.channel_name}</span>
                        {relDateStr && <span>{relDateStr}</span>}
                      </div>
                    </a>
                  )
                })}
              </FeedCarousel>
            </div>
          )}
        </section>
      )}
    </>
  )
}
