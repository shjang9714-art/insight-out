import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Quote } from 'lucide-react'
import BackLink from '@/components/BackLink'
import PageContainer from '@/components/PageContainer'
import EntityTabs from '@/components/entities/EntityTabs'
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
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface ContentMeta {
  id: string
  title: string
  category: string | null
  published_at: string | null
  sources: { name: string } | { name: string }[] | null
  matched_keywords: string[] | null
}

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

function sourceName(sources: ContentMeta['sources']): string | null {
  return Array.isArray(sources) ? sources[0]?.name ?? null : sources?.name ?? null
}

export const metadata: Metadata = {
  title: '기업 동향 상세 | Insight Out',
  description: '인사이트 카드의 핵심·시사점·근거를 확인합니다.',
}

export default async function InsightDetailPage({ params }: PageProps) {
  const { id } = await params

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

  // 내 관련도 — 로그인 사용자의 워치리스트(회사)·담당서비스(산업) 문자열 매칭(간이, lens.ts와 동일 방식)
  const { data: { user } } = await supabase.auth.getUser()
  let relevanceMatched = false
  let hasPersonalization = false
  if (user) {
    const [{ data: watchlistRows }, { data: serviceRows }] = await Promise.all([
      supabase.from('user_watchlist').select('company').eq('user_id', user.id),
      supabase.from('user_services').select('services(name)').eq('user_id', user.id),
    ])
    const watchlist = ((watchlistRows ?? []) as { company: string }[]).map(w => w.company.toLowerCase())
    const serviceNames = ((serviceRows ?? []) as unknown as { services: { name: string } | { name: string }[] | null }[])
      .flatMap(r => {
        const s = r.services
        if (!s) return []
        return Array.isArray(s) ? s.map(x => x.name.toLowerCase()) : [s.name.toLowerCase()]
      })
    hasPersonalization = watchlist.length > 0 || serviceNames.length > 0
    const topicLower = card.topic.toLowerCase()
    relevanceMatched =
      watchlist.some(w => topicLower.includes(w) || w.includes(topicLower)) ||
      serviceNames.some(s => topicLower.includes(s) || s.includes(topicLower))
  }

  const importance = computeImportance(card)
  const relevance = computeRelevance(relevanceMatched ? 1 : 0, relevanceMatched, hasPersonalization)
  const relatedKeywords = computeRelatedKeywords(card, Object.fromEntries(
    Object.entries(contentMap).map(([cid, meta]) => [cid, { matchedKeywords: meta.matched_keywords }])
  ))
  const cardHeadline = card.card_headline ? stripLlmArtifacts(card.card_headline) : null
  const headline = stripLlmArtifacts(card.headline)
  const implication = card.implication ? stripLlmArtifacts(card.implication) : null

  const backHref = card.scope === 'company' ? '/dashboard/entities?view=watchlist' : '/dashboard/ai-analysis'

  return (
    <PageContainer variant="reading">
      {/* scope='company' 카드는 기업동향(주요 기업 탭)에서만 진입 — 그 경우에만 Lv.2 탭 유지.
          그 외(헤드라인 분석 등 Lv.1 실험실 탭)는 전역 헤더가 이미 컨텍스트를 유지하므로 생략. */}
      {card.scope === 'company' && <EntityTabs value="watchlist" />}

      <div className="mb-6">
        <BackLink
          fallbackHref={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
      </div>

      {/* 헤더 */}
      <div className="mb-6 space-y-2">
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
        <h1 className="text-2xl font-bold text-foreground leading-snug">
          {cardHeadline ?? headline}
        </h1>
        {cardHeadline && cardHeadline !== headline && (
          <p className="text-base text-muted-foreground leading-relaxed">{headline}</p>
        )}
      </div>

      {/* 시사점 */}
      {implication && (
        <div className="mb-8 space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">시사점</h2>
          <p className="text-base text-foreground leading-relaxed">{implication}</p>
        </div>
      )}

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
