import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Quote } from 'lucide-react'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import BookmarkButton from '@/components/bookmark/BookmarkButton'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import {
  computeImportance,
  computeRelevance,
  computeRelatedKeywords,
  IMPORTANCE_LABEL,
  IMPORTANCE_CLS,
  RELEVANCE_LABEL,
  RELEVANCE_CLS,
} from '@/lib/insight/card-meta'
import { buildCompanyMatchOr, getCompanyNewsSinceIso } from '@/lib/insight/company-match'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { isAdminRole } from '@/lib/admin/capabilities'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}

interface ContentMeta {
  id: string
  title: string
  category: string | null
  published_at: string | null
  sources: { name: string } | { name: string }[] | null
  matched_keywords: string[] | null
}

interface CompanyNewsItem {
  id: string
  title: string
  published_at: string | null
  collected_at: string
  sources: ContentMeta['sources']
}

const COMPANY_NEWS_WINDOW_DAYS = 30
const COMPANY_NEWS_LIMIT = 10

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

function sourceName(sources: ContentMeta['sources']): string | null {
  return Array.isArray(sources) ? sources[0]?.name ?? null : sources?.name ?? null
}

function formatNewsDate(date: string): string {
  return new Date(date).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

function splitImplicationItems(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []

  const superscriptMarkers = normalized.match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) ?? []
  const hasSuperscriptList =
    superscriptMarkers.length > 1 && /(?:^|\s)[¹²³⁴⁵⁶⁷⁸⁹]/.test(normalized)

  let withMarkerBreaks = normalized.replace(/\s*(?=[①-⑳])/g, '\n')
  withMarkerBreaks = (hasSuperscriptList
    ? withMarkerBreaks.replace(/\s*(?=[¹²³⁴⁵⁶⁷⁸⁹])/g, '\n')
    : withMarkerBreaks.replace(/(^|\s+)(?=[¹²³⁴⁵⁶⁷⁸⁹]\s*)/g, '$1\n'))
    .replace(/(^|\s+)(?=\d{1,2}\.\s)/g, '$1\n')

  if (!withMarkerBreaks.includes('\n')) return [normalized]

  return withMarkerBreaks
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export const metadata: Metadata = {
  title: '기업 동향 상세 | Insight Out',
  description: '인사이트 카드의 핵심·시사점·근거를 확인합니다.',
}

export default async function InsightDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = await searchParams
  const selectedWeek = typeof query.week === 'string' && query.week ? query.week : undefined

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

  const { data: cardRow, error: cardErr } = await supabase
    .from('insight_cards')
    .select('id, period_start, period_end, scope, topic, headline, card_headline, implication, source_content_ids, citations, generated_at, status')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (cardErr || !cardRow) notFound()
  const card = cardRow as InsightCard

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = isAdminRole(profile?.role)
  if (card.scope === 'industry' && !isAdmin) notFound()

  const citations = (card.citations ?? []) as InsightCardCitation[]
  const citedIds = new Set(citations.map(c => c.content_id))
  const referenceOnlyIds = card.source_content_ids.filter(cid => !citedIds.has(cid))
  const allIds = [...new Set([...citedIds, ...referenceOnlyIds])]

  const contentMap: Record<string, ContentMeta> = {}
  if (allIds.length > 0) {
    const { data: contents } = await supabase
      .from('contents')
      .select('id, title, category, published_at, matched_keywords, sources(name)')
      .in('id', allIds)
    for (const row of (contents ?? []) as unknown as ContentMeta[]) {
      contentMap[row.id] = row
    }
  }

  let companyNews: CompanyNewsItem[] = []
  if (card.scope === 'company') {
    try {
      const { data: companyRow, error: companyError } = await supabase
        .from('curated_companies')
        .select('aliases')
        .eq('name', card.topic)
        .maybeSingle()

      if (companyError) {
        console.warn('[기업 최근 뉴스] 회사 별칭 조회 실패:', companyError.message)
      }

      const aliases = !companyError && Array.isArray(companyRow?.aliases)
        ? companyRow.aliases.filter((alias): alias is string => typeof alias === 'string')
        : []
      const since = getCompanyNewsSinceIso(COMPANY_NEWS_WINDOW_DAYS)
      let newsQuery = supabase
        .from('contents')
        .select('id, title, published_at, collected_at, sources(name)')
        .eq('status', 'published')
        .gte('collected_at', since)
        .or(buildCompanyMatchOr(card.topic, aliases))
        .order('collected_at', { ascending: false })
        .limit(COMPANY_NEWS_LIMIT)

      if (allIds.length > 0) {
        newsQuery = newsQuery.not('id', 'in', `(${allIds.join(',')})`)
      }

      const { data: newsRows, error: newsError } = await newsQuery
      if (newsError) {
        console.warn('[기업 최근 뉴스] 콘텐츠 조회 실패:', newsError.message)
      } else {
        companyNews = (newsRows ?? []) as unknown as CompanyNewsItem[]
      }
    } catch (error) {
      console.warn(
        '[기업 최근 뉴스] 섹션 조회 중 오류:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  // 내 관련도 — 로그인 사용자의 워치리스트(회사) 문자열 매칭(간이, lens.ts와 동일 방식)
  let relevanceMatched = false
  let hasPersonalization = false
  if (user) {
    const { data: watchlistRows } = await supabase
      .from('user_watchlist')
      .select('company')
      .eq('user_id', user.id)
    const watchlist = ((watchlistRows ?? []) as { company: string }[]).map(w => w.company.toLowerCase())
    hasPersonalization = watchlist.length > 0
    const topicLower = card.topic.toLowerCase()
    relevanceMatched = watchlist.some(w => topicLower.includes(w) || w.includes(topicLower))
  }

  const importance = computeImportance(card)
  const relevance = computeRelevance(relevanceMatched ? 1 : 0, relevanceMatched, hasPersonalization)
  const relatedKeywords = computeRelatedKeywords(card, Object.fromEntries(
    Object.entries(contentMap).map(([cid, meta]) => [cid, { matchedKeywords: meta.matched_keywords }])
  ))
  const cardHeadline = card.card_headline ? stripLlmArtifacts(card.card_headline) : null
  const headline = stripLlmArtifacts(card.headline)
  const implication = card.implication ? stripLlmArtifacts(card.implication) : null
  const implicationItems = implication ? splitImplicationItems(implication) : []

  const backHref = card.scope === 'company'
    ? `/dashboard/entities?view=watchlist${selectedWeek ? `&week=${encodeURIComponent(selectedWeek)}` : ''}`
    : '/dashboard/ai-analysis'

  return (
    <PageContainer variant="reading">
      {/* Lv.2 탭은 DashboardHeader의 sticky L2 행이 항상 보여준다(372). */}

      <div className="mb-6">
        <BackLink
          fallbackHref={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      {/* 헤더 */}
      <div className="mb-6 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded px-2 py-0.5 text-xs font-medium bg-brand-600/10 text-brand-600">
              {card.topic}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${IMPORTANCE_CLS[importance]}`}>
              {IMPORTANCE_LABEL[importance]}
            </span>
            {(relevance === 'high' || relevance === 'mid') && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${RELEVANCE_CLS[relevance]}`}>
                {RELEVANCE_LABEL[relevance]}
              </span>
            )}
            <span className="text-xs text-muted-foreground/70">
              {formatPeriod(card.period_start, card.period_end)}
            </span>
          </div>
          <div className="shrink-0">
            <BookmarkButton insightCardId={card.id} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground leading-snug">
          {cardHeadline ?? headline}
        </h1>
        {cardHeadline && cardHeadline !== headline && (
          <p className="text-base text-muted-foreground leading-relaxed">{headline}</p>
        )}
      </div>

      {/* 근거 자료 */}
      {(citations.length > 0 || referenceOnlyIds.length > 0) && (
        <div className="mb-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">근거 자료</h2>

          {citations.length > 0 && (
            <ul className="space-y-3">
              {citations.map((c, i) => {
                const meta = contentMap[c.content_id]
                return (
                  <li key={i} className="flex gap-2.5 rounded-lg border border-border bg-card p-4">
                    <Quote className="h-4 w-4 mt-0.5 shrink-0 text-brand-600/40" />
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm text-foreground/90 italic leading-relaxed">&ldquo;{c.quote}&rdquo;</p>
                      {meta ? (
                        <Link
                          href={`/dashboard/contents/${c.content_id}`}
                          prefetch={false}
                          target="_blank"
                          rel="noopener"
                          className="block text-sm text-brand-600 hover:underline"
                        >
                          {meta.title}
                          {sourceName(meta.sources) && (
                            <span className="ml-1 text-muted-foreground/60">· {sourceName(meta.sources)}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="block text-sm text-muted-foreground/60">출처 비공개</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {referenceOnlyIds.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground/60">참고 기사</p>
              <ul className="space-y-1">
                {referenceOnlyIds.map(cid => {
                  const meta = contentMap[cid]
                  return meta ? (
                    <li key={cid}>
                      <Link
                        href={`/dashboard/contents/${cid}`}
                        prefetch={false}
                        target="_blank"
                        rel="noopener"
                        className="block text-sm text-brand-600 hover:underline truncate"
                      >
                        {meta.title}
                        {sourceName(meta.sources) && (
                          <span className="ml-1 text-muted-foreground/60">· {sourceName(meta.sources)}</span>
                        )}
                      </Link>
                    </li>
                  ) : null
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 회사 카드 전용 최근 뉴스 — 기존 근거 자료와 중복되는 콘텐츠는 조회에서 제외한다. */}
      {companyNews.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            이 회사 최근 뉴스
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
            {companyNews.map((news) => {
              const newsSource = sourceName(news.sources)
              const newsDate = formatNewsDate(news.published_at ?? news.collected_at)

              return (
                <li key={news.id}>
                  <Link
                    href={`/dashboard/contents/${news.id}`}
                    prefetch={false}
                    className="group block px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
                      {news.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[newsSource, newsDate].filter(Boolean).join(' · ')}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 시사점 */}
      {implicationItems.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">시사점</h2>
          <div className="space-y-3">
            {implicationItems.map((item, index) => (
              <p key={index} className="text-base leading-relaxed text-foreground">
                {item}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 관련 키워드 */}
      {relatedKeywords.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground/60">관련 키워드:</span>
          {relatedKeywords.map(kw => (
            <Link
              key={kw}
              href={`/dashboard/topics/${encodeURIComponent(kw)}`}
              prefetch={false}
              className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:text-foreground"
            >
              {kw}
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
