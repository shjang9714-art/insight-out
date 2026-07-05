import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import Image from 'next/image'
import { ExternalLink, ArrowLeft, Download, FileText } from 'lucide-react'
import ArchiveButton from '@/components/archive/ArchiveButton'
import BookmarkButton from '@/components/bookmark/BookmarkButton'
import TranslatedArticle from '@/components/contents/TranslatedArticle'
import RecordRecentView from '@/components/contents/RecordRecentView'
import ArticleBodyLoader from '@/components/contents/ArticleBodyLoader'
import ContentArticleView from '@/components/contents/ContentArticleView'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { getReportSignedUrl } from '@/lib/contents/report-url'
import { getRelatedGrouped, getRelatedYoutube } from '@/lib/contents/related'
import FeedCarousel from '@/components/feed/FeedCarousel'
import { CONTENT_CATEGORY_LABEL, ENTITY_TYPE_LABEL, type ContentCategory, type EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
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
  content_services: { services: { name: string } | null }[]
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
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
  // deprecated
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
}

// ─── 메타데이터 ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const { data } = await supabase
    .from('contents')
    .select('title')
    .eq('id', id)
    .single()

  const title = data?.title ?? '콘텐츠 상세'
  return {
    title: `${title} | Insight Out`,
    description: title,
  }
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function ContentDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const { data, error } = await supabase
    .from('contents')
    .select(`
      id, title, title_original, category,
      summary_ko, body_original, body_translated_ko, original_language, body_fetched_at,
      file_path, original_url, author, published_at, collected_at,
      matched_keywords, matched_groups, cluster_id,
      sources(name),
      content_services(services(name)),
      content_keywords(keywords(name))
    `)
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) {
    notFound()
  }

  const content = data as unknown as ContentDetail

  // 별도 가드 쿼리: link_ok(컬럼 없으면 null→정상 링크 표시, 42703 graceful)
  const { data: lh } = await supabase.from('contents').select('link_ok').eq('id', id).single()
  const linkDead = (lh as { link_ok: boolean | null } | null)?.link_ok === false

  // ── 리포트(file_path) vs 뉴스(original_url) 분기 ─────────────────────────
  const isReport = Boolean(content.file_path)
  const hasKoreanTranslation =
    content.original_language === 'en' &&
    Boolean(content.body_translated_ko)

  let signedUrl: string | null = null
  let isPdf = false

  if (isReport) {
    // 비공개 버킷 서명 URL 생성 (실패 시 null → 폴백 메시지)
    signedUrl = await getReportSignedUrl(content.file_path!)
    isPdf = content.file_path!.toLowerCase().endsWith('.pdf')
  }
  // 뉴스 분기: ensureFullBody 는 ArticleBody 안에서 스트리밍 — 이 시점엔 호출하지 않음

  const currentMeta = {
    id: content.id,
    matched_keywords: content.matched_keywords,
    matched_groups: content.matched_groups,
    cluster_id: content.cluster_id,
  }
  const [grouped, youtubeRelated, entityRes] = await Promise.all([
    getRelatedGrouped(supabase, currentMeta),
    getRelatedYoutube(supabase, currentMeta),
    supabase
      .from('content_entities')
      .select('entities(id, canonical_name, entity_type, is_competitor)')
      .eq('content_id', id)
      .limit(20),
  ])

  type EntityRow = { id: string; canonical_name: string; entity_type: EntityType; is_competitor: boolean }
  const relatedEntities: EntityRow[] = (entityRes.data ?? [])
    .map((r: unknown) => {
      const row = r as { entities: EntityRow | null }
      return row.entities
    })
    .filter((e): e is EntityRow => e !== null)

  const catStyle =
    CATEGORY_STYLE[content.category] ?? 'bg-muted text-muted-foreground border-border'

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

      {/* 뒤로가기 */}
      <div className="mb-6">
        <Link
          href="/dashboard/contents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          목록으로
        </Link>
      </div>

      <RecordRecentView id={content.id} title={content.title} category={content.category} />

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
                  <BookmarkButton contentId={content.id} />
                  <ArchiveButton contentId={content.id} />
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

              {(serviceNames.length > 0 || keywordNames.length > 0) && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                  {serviceNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
                    >
                      {name}
                    </span>
                  ))}
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
            serviceNames={serviceNames}
            keywordNames={keywordNames}
            actions={
              <>
                <BookmarkButton contentId={content.id} />
                <ArchiveButton contentId={content.id} />
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
                      원문 보기
                    </a>
                  )
                )}
              </>
            }
          >
            {isReport ? (
              <>
                {content.summary_ko && (
                  <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                    {content.summary_ko}
                  </p>
                )}

                {signedUrl && isPdf ? (
              /* PDF iframe 미리보기 */
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
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        새 탭에서 열기
                      </a>
                    </div>
                  </div>
                ) : signedUrl && !isPdf ? (
              /* PDF 외 파일: 다운로드 안내 */
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">이 파일은 미리보기를 지원하지 않습니다.</p>
                    <a
                      href={signedUrl}
                      download
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
                    >
                      <Download className="h-4 w-4" />
                      파일 다운로드
                    </a>
                  </div>
                ) : (
              /* 서명 URL 생성 실패 */
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    파일을 불러올 수 없습니다.
                  </div>
                )}
              </>
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
          <Link
            href="/dashboard/contents"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          >
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Link>

          <div className="flex items-center gap-2">
            {/* 북마크 저장 */}
            <BookmarkButton contentId={content.id} />

            {/* 아카이빙 담기 */}
            <ArchiveButton contentId={content.id} />

            {/* 뉴스에만 원문 보기 링크 표시 */}
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
                  원문 보기
                </a>
              )
            )}
          </div>
        </div>
      </article>

      {/* 관련 엔티티 칩 */}
      {relatedEntities.length > 0 && (
        <section className="mt-6 border-t border-border pt-5">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">관련 엔티티</p>
          <div className="flex flex-wrap gap-1.5">
            {relatedEntities.map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/entities/${e.id}`}
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
    </div>
  )
}
