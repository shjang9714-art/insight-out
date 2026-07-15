import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CircleHelp,
  Clock3,
  FileText,
  Network,
  TrendingUp,
} from 'lucide-react'
import AiMark from '@/components/ui/AiMark'
import EntityEventTimeline from '@/components/entities/EntityEventTimeline'
import KeywordTrendChart from '@/components/keywords/KeywordTrendChart'
import PageContainer from '@/components/PageContainer'
import {
  getKeywordDailyCounts,
  getKeywordRelated,
  getKeywordSnapshot,
  type KeywordArticle,
} from '@/lib/keywords/detail'
import { getRiseFactors, type RiseFactorSet } from '@/lib/keywords/rise'
import {
  BUCKET_CHIP_CLS,
  TAG_BUCKETS,
  type TagBucket,
} from '@/lib/tag-buckets'
import { ENTITY_TYPE_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface KeywordDetailPageProps {
  params: Promise<{ name: string }>
}

interface MetricCardProps {
  label: string
  value: string
  description: string
}

function decodeKeyword(value: string): string {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return '갱신 정보 없음'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000))
  return `${hours.toLocaleString()}시간 전 갱신`
}

function formatKstDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  })
}

function getKstDateKey(value: string): string {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        <span title={description} className="inline-flex">
          <CircleHelp className="size-3.5" aria-label={description} role="img" />
        </span>
      </div>
      <strong className="mt-2 block text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </strong>
    </div>
  )
}

function changeLabel(changePct: number, isNew: boolean): string {
  if (isNew) return 'NEW'
  if (changePct > 0) return `▲ ${changePct}%`
  if (changePct < 0) return `▽ ${Math.abs(changePct)}%`
  return '0%'
}

function KeywordArticleTimeline({ articles }: { articles: KeywordArticle[] }) {
  const grouped = new Map<string, KeywordArticle[]>()
  for (const article of articles.slice(0, 40)) {
    const key = getKstDateKey(article.collectedAt)
    const items = grouped.get(key) ?? []
    items.push(article)
    grouped.set(key, items)
  }

  if (grouped.size === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        최근 30일 동안 연결된 원문이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-7">
      {[...grouped.entries()].map(([date, items]) => (
        <section key={date}>
          <div className="mb-3 flex items-center gap-3">
            <time className="text-xs font-medium text-muted-foreground" dateTime={date}>
              {formatKstDate(items[0].collectedAt)}
            </time>
            <div className="h-px flex-1 bg-border" />
          </div>
          <ul className="space-y-3">
            {items.map((article) => (
              <li key={article.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {article.category && <span>{article.category}</span>}
                  {article.category && article.sourceName && <span>·</span>}
                  {article.sourceName && <span>{article.sourceName}</span>}
                </div>
                <Link
                  href={`/dashboard/contents/${article.id}`}
                  prefetch={false}
                  className="text-sm font-semibold leading-snug text-foreground transition-colors hover:text-brand-600"
                >
                  {article.title}
                </Link>
                {article.summary && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {article.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function RiseFootnotes({
  evidence,
  indexById,
}: {
  evidence: string[]
  indexById: Map<string, number>
}) {
  const references = evidence
    .map((contentId) => ({ contentId, index: indexById.get(contentId) }))
    .filter((item): item is { contentId: string; index: number } => typeof item.index === 'number')
  if (references.length === 0) return null
  return (
    <span className="ml-1 align-super text-[11px] font-medium text-brand-600">
      {references.map(({ contentId, index }) => (
        <Link
          key={contentId}
          href={`/dashboard/contents/${contentId}`}
          prefetch={false}
          className="hover:underline"
        >
          [{index}]
        </Link>
      ))}
    </span>
  )
}

function RiseFactorsSection({
  riseFactors,
  articles,
}: {
  riseFactors: RiseFactorSet | null
  articles: KeywordArticle[]
}) {
  if (!riseFactors) {
    return (
      <section className="mb-8 rounded-xl border border-dashed border-brand-600/30 bg-brand-50/40 p-5 dark:bg-brand-950/10">
        <div className="flex items-start gap-3">
          <AiMark title="AI 분석" className="mt-0.5 size-5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">상승 요인</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              분석 준비 중입니다. 다음 단계에서 근거 사건을 묶어 상승 배경을 제공합니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  const articleById = new Map(articles.map((article) => [article.id, article]))
  const evidenceIds = Array.from(new Set(riseFactors.factors.flatMap((factor) => factor.evidence)))
  const indexById = new Map(evidenceIds.map((contentId, index) => [contentId, index + 1]))

  return (
    <section className="mb-8 rounded-xl border border-brand-600/20 bg-card p-5" aria-labelledby="rise-factors-title">
      <div className="mb-5 flex items-start gap-3">
        <AiMark title="AI 분석" className="mt-0.5 size-5" />
        <div>
          <h2 id="rise-factors-title" className="text-base font-semibold text-foreground">상승 요인</h2>
          {riseFactors.overview && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{riseFactors.overview}</p>
          )}
        </div>
      </div>

      <ol className="grid gap-3 md:grid-cols-2">
        {riseFactors.factors.map((factor, index) => (
          <li key={`${factor.thesis}-${index}`} className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-start gap-2.5">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-950/30">
                {index + 1}
              </span>
              <h3 className="text-sm font-semibold leading-snug text-foreground">
                {factor.thesis}
                <RiseFootnotes evidence={factor.evidence} indexById={indexById} />
              </h3>
            </div>
            <p className="pl-8.5 text-sm leading-relaxed text-muted-foreground">{factor.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-border pt-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">근거</p>
        <ol className="space-y-1">
          {evidenceIds.map((contentId, index) => {
            const article = articleById.get(contentId)
            return (
              <li key={contentId} className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-brand-600">[{index + 1}]</span>{' '}
                <Link
                  href={`/dashboard/contents/${contentId}`}
                  prefetch={false}
                  className="transition-colors hover:text-brand-600"
                >
                  {article?.title ?? '근거 콘텐츠'}
                </Link>
                {article && <> · {formatKstDate(article.publishedAt ?? article.collectedAt)}</>}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export async function generateMetadata({ params }: KeywordDetailPageProps): Promise<Metadata> {
  const { name } = await params
  const keyword = decodeKeyword(name) || '키워드'
  return {
    title: `${keyword} 키워드 분석 | Insight Out`,
    description: `${keyword} 관련 문서, 관심도 추이, 연관 키워드와 사건 타임라인`,
  }
}

export default async function KeywordDetailPage({ params }: KeywordDetailPageProps) {
  const { name } = await params
  const keyword = decodeKeyword(name)
  if (!keyword) notFound()

  const [dailyCounts, snapshot, related, riseFactors] = await Promise.all([
    getKeywordDailyCounts(keyword),
    getKeywordSnapshot(keyword),
    getKeywordRelated(keyword),
    getRiseFactors(keyword),
  ])

  const trendLabel = changeLabel(snapshot.changePct, snapshot.isNew)
  const relatedByBucket = new Map<TagBucket, typeof related.keywords>()
  for (const bucket of TAG_BUCKETS) {
    relatedByBucket.set(bucket, related.keywords.filter((item) => item.bucket === bucket))
  }
  const eventsUpdatedAt = related.events.reduce<string | null>((latest, event) => {
    if (!event.generatedAt) return latest
    return !latest || event.generatedAt > latest ? event.generatedAt : latest
  }, null)
  const eventItems = related.events.map((event) => ({
    id: event.id,
    event_date: event.event_date,
    signal_type: event.signal_type,
    headline: event.headline,
    detail: event.detail,
    sentiment: event.sentiment,
    citations: event.citations,
  }))
  const factorIndexByContent = new Map<string, number>()
  riseFactors?.factors.forEach((factor, index) => {
    factor.evidence.forEach((contentId) => {
      if (!factorIndexByContent.has(contentId)) factorIndexByContent.set(contentId, index + 1)
    })
  })
  const dateByContent = new Map(
    related.articles.map((article) => [article.id, getKstDateKey(article.publishedAt ?? article.collectedAt)]),
  )
  for (const event of related.events) {
    for (const contentId of event.citations) dateByContent.set(contentId, event.event_date)
  }
  const markerLabelsByDate = new Map<string, Set<number>>()
  for (const [contentId, factorIndex] of factorIndexByContent) {
    const date = dateByContent.get(contentId)
    if (!date) continue
    const indexes = markerLabelsByDate.get(date) ?? new Set<number>()
    indexes.add(factorIndex)
    markerLabelsByDate.set(date, indexes)
  }
  const trendMarkers = Array.from(markerLabelsByDate, ([date, indexes]) => ({
    date,
    label: Array.from(indexes).map((index) => `[${index}]`).join(''),
  }))

  const metrics: MetricCardProps[] = [
    {
      label: '관련 문서',
      value: `${snapshot.documentCount.toLocaleString()}건`,
      description: '최근 30일 동안 이 키워드가 태깅된 고유 콘텐츠 수입니다.',
    },
    {
      label: '총 언급',
      value: `${snapshot.totalMentions.toLocaleString()}회`,
      description: '관련 문서의 matched_keywords 배열에서 이 키워드가 등장한 횟수입니다.',
    },
    {
      label: '7일 증감',
      value: trendLabel,
      description: '최근 7일 문서 수를 직전 7일과 비교한 증감률입니다.',
    },
    {
      label: '연관 기업',
      value: `${snapshot.relatedCompanyCount.toLocaleString()}곳`,
      description: '관련 문서에 이 키워드와 함께 등장한 고유 기업 수입니다.',
    },
    {
      label: '신규 사건',
      value: `${snapshot.newEventCount.toLocaleString()}건`,
      description: '최근 7일 관련 콘텐츠에 연결된 사건 수입니다.',
    },
  ]

  return (
    <PageContainer className="py-8">

      <nav aria-label="현재 위치" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link href="/dashboard/issues?view=keyword" className="transition-colors hover:text-brand-600">
          키워드 분석
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-foreground">{keyword}</span>
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{keyword}</h1>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', BUCKET_CHIP_CLS[related.bucket])}>
            {related.bucket}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className={cn(
            'inline-flex items-center gap-1.5 font-medium',
            snapshot.changePct > 0 && 'text-positive',
            snapshot.changePct < 0 && 'text-negative',
          )}>
            <TrendingUp className="size-4" aria-hidden />
            최근 7일 {trendLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4" aria-hidden />
            {formatUpdatedAt(snapshot.lastUpdatedAt)}
          </span>
          {related.entity && (
            <Link
              href={`/dashboard/entities/${related.entity.id}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 text-brand-600 hover:underline"
            >
              {related.entity.name} 기업 정보
            </Link>
          )}
        </div>
      </header>

      {snapshot.isTruncated && (
        <p className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          관련 문서가 많아 최신 2,000건을 기준으로 집계했습니다.
        </p>
      )}

      <section aria-labelledby="keyword-metrics" className="mb-8">
        <h2 id="keyword-metrics" className="sr-only">핵심 지표</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </div>
      </section>

      {snapshot.documentCount === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed p-12 text-center">
          <FileText className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">최근 30일 관련 문서가 없습니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">새 콘텐츠가 수집되면 추이와 연관 정보가 표시됩니다.</p>
        </div>
      ) : (
        <section className="mb-8 rounded-xl border border-border bg-card p-5" aria-labelledby="keyword-trend">
          <div className="mb-4">
            <h2 id="keyword-trend" className="text-base font-semibold text-foreground">관심도 추이</h2>
            <p className="mt-1 text-xs text-muted-foreground">최근 30일 일별 관련 문서 수 · KST 기준</p>
          </div>
          <KeywordTrendChart data={dailyCounts} markers={trendMarkers} />
        </section>
      )}

      <RiseFactorsSection riseFactors={riseFactors} articles={related.articles} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <section className="min-w-0" aria-labelledby="keyword-timeline">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="size-4 text-brand-600" aria-hidden />
            <h2 id="keyword-timeline" className="text-base font-semibold text-foreground">사건 타임라인</h2>
          </div>
          {related.entity && related.events.length > 0 ? (
            <EntityEventTimeline events={eventItems} updatedAt={eventsUpdatedAt} />
          ) : (
            <KeywordArticleTimeline articles={related.articles} />
          )}
        </section>

        <aside className="space-y-5 self-start lg:sticky lg:top-24">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">관련 키워드</h2>
            {related.keywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">함께 등장한 키워드가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {TAG_BUCKETS.map((bucket) => {
                  const items = relatedByBucket.get(bucket) ?? []
                  if (items.length === 0) return null
                  const visible = items.slice(0, 4)
                  const hidden = items.slice(4)
                  return (
                    <div key={bucket}>
                      <p className="mb-2 text-[11px] font-medium text-muted-foreground">{bucket}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {visible.map((item) => (
                          <Link
                            key={item.name}
                            href={`/dashboard/keywords/${encodeURIComponent(item.name)}`}
                            prefetch={false}
                            className={cn('rounded-full px-2 py-1 text-[11px] font-medium transition-opacity hover:opacity-75', BUCKET_CHIP_CLS[item.bucket])}
                          >
                            {item.name} · {item.count}
                          </Link>
                        ))}
                      </div>
                      {hidden.length > 0 && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">전체보기 (+{hidden.length})</summary>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {hidden.map((item) => (
                              <Link
                                key={item.name}
                                href={`/dashboard/keywords/${encodeURIComponent(item.name)}`}
                                prefetch={false}
                                className={cn('rounded-full px-2 py-1 text-[11px] font-medium', BUCKET_CHIP_CLS[item.bucket])}
                              >
                                {item.name} · {item.count}
                              </Link>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">연관 기업</h2>
            {related.entities.length === 0 ? (
              <p className="text-xs text-muted-foreground">함께 등장한 기업·기관이 없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {related.entities.slice(0, 8).map((entity) => (
                  <li key={entity.id}>
                    <Link
                      href={`/dashboard/entities/${entity.id}`}
                      prefetch={false}
                      className="flex items-center justify-between gap-3 text-sm text-foreground hover:text-brand-600"
                    >
                      <span className="truncate">{entity.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {ENTITY_TYPE_LABEL[entity.type]} · {entity.count}건
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {related.entity && (
            <Link
              href="/dashboard/issues?view=graph"
              prefetch={false}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 text-sm font-medium text-foreground transition-colors hover:border-brand-600/40 hover:text-brand-600"
            >
              <span className="inline-flex items-center gap-2">
                <Network className="size-4" aria-hidden />
                관계지도에서 보기
              </span>
              <span aria-hidden>→</span>
            </Link>
          )}
        </aside>
      </div>
    </PageContainer>
  )
}
