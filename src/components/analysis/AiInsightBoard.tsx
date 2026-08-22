'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import type { EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  BUCKET_ACCENT_CLS,
  BUCKET_BAR_CLS,
  BUCKET_CHIP_CLS,
  BUCKET_DOT_CLS,
  TAG_BUCKETS,
  type KeywordItem,
  type TagBucket,
} from '@/lib/tag-buckets'
import DailyInsightList from '@/components/daily-insights/DailyInsightList'
import WeeklyInsightHeader from '@/components/daily-insights/WeeklyInsightHeader'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import EntitiesPageClient from '@/components/entities/EntitiesPageClient'
import PageHeader from '@/components/PageHeader'
import type { IssueCard } from '@/lib/issues/activity'
import { Building2, ChartNoAxesColumnIncreasing, Cpu, Landmark, Sparkles, TrendingUp } from 'lucide-react'
import KeywordSparkline from '@/components/analysis/KeywordSparkline'
import { classifyKeyword, rankKeywords, type KeywordRankingMode } from '@/lib/keywords/ranking'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

export interface TopicTrend {
  group: string
  cur: number
  prev: number
  changePct: number | null
}

export type AiInsightViewId = 'brief' | 'headline' | 'trending' | 'issues' | 'graph' | 'keyword'

/** 엔티티별 시그널 요약 — 구 기업동향 브리핑(224에서 제거)을 옮겨옴(224B). */
export interface SignalItem {
  entityId: string
  name: string
  entityType: EntityType
  isCompetitor: boolean
  signalCount: number
  contentCount: number
  signalTypes: string[]
  lastSeen: string | null
}

export interface AiInsightBoardProps {
  initialView: AiInsightViewId
  dailyInsights: DailyInsightRow[]
  dailyInsightWeeks: string[]
  selectedWeek: string | null
  isLatestWeek: boolean
  weekTotal: number
  weekNewCount: number
  weekCategoryCoverage: number
  insightGroups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  trendingTopics: TopicTrend[]
  keywordAggregationError: string | null
  classifiedKeywords: KeywordItem[]
  kwStrip: KeywordItem[]
  issueCards: IssueCard[]
  bucketByTopic: Record<string, TagBucket>
  entities: EntitySummary[]
  allEntities: {
    id: string
    canonical_name: string
    entity_type: EntityType
    is_competitor: boolean
    mention_count: number
    description: string | null
  }[]
  initialCenter: EntitySummary | null
  totalByType: Record<string, number>
  signalItems: SignalItem[]
  keywordDailySeries: Record<string, { date: string; count: number }[]>
  isAdmin: boolean
}

// ─── 하위 카테고리 탭 ──────────────────────────────────────────────────────────

// 사용자에게 항상 보이는 하위 카테고리 (요청 순서 고정)
const PRIMARY_TABS: { id: AiInsightViewId; label: string }[] = [
  { id: 'brief',   label: '핵심 인사이트' },
  { id: 'keyword', label: '키워드 분석' },
  { id: 'graph',   label: '관계지도' },
]

// 관리자 전용 '실험실' — 일반 사용자에게 숨김. 추후 다른 서비스 구상 시 재활용.
const LAB_TABS: { id: AiInsightViewId; label: string }[] = [
  { id: 'headline', label: '헤드라인 분석' },
  { id: 'trending', label: '뜨는 토픽' },
  { id: 'issues',   label: '이슈 타임라인' },
]

const LAB_VIEW_IDS: readonly AiInsightViewId[] = LAB_TABS.map(t => t.id)
const VALID_VIEW_IDS: readonly AiInsightViewId[] = [...PRIMARY_TABS, ...LAB_TABS].map(t => t.id)

// 공통 페이지 헤더(§PageHeader) 문구 — 핵심 인사이트·키워드 분석·관계지도 3탭.
const TAB_HEADER_META: Partial<Record<AiInsightViewId, { title: string; description: string }>> = {
  brief: {
    title: '핵심 인사이트',
    description: '매주 업계 주요 이슈 중 보도량·업계 파급력·최신성을 기준으로 핵심 사안을 선별해, LG유플러스 관점의 기회·리스크·실행 제안으로 정리한 주간 인사이트입니다.',
  },
  keyword: {
    title: '키워드 분석',
    description: '업계에서 오르내리는 키워드를 급상승·신규·관심 지속·하락으로 나눠 최근 흐름을 보여주는 분석입니다.',
  },
  graph: {
    title: '관계지도',
    description: '기업·기술·인물·정책이 뉴스에서 함께 등장한 연결 관계를 지도로 보여주는 화면입니다.',
  },
}

interface KeywordChangeCard {
  id: 'rising' | 'new' | 'highlight'
  bucket: TagBucket
  title: string
  evidence: string
  keyword: string
}

const KEYWORD_RANKING_TABS: { id: KeywordRankingMode; label: string }[] = [
  { id: 'rising', label: '급상승' },
  { id: 'new', label: '신규' },
  { id: 'sustained', label: '관심 지속' },
]

function entityTypeToBucket(type: EntityType): TagBucket {
  if (type === 'tech' || type === 'product') return '기술·제품'
  if (type === 'company' || type === 'person') return '기업·기관'
  if (type === 'industry') return '시장·산업'
  if (type === 'policy') return '정책·규제'
  return '그 외'
}

function buildKeywordChangeCards(keywords: KeywordItem[]): KeywordChangeCard[] {
  const cards: KeywordChangeCard[] = []
  const fastestRising = keywords
    .filter(keyword => classifyKeyword(keyword) === 'rising')
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0) || (b.cur ?? 0) - (a.cur ?? 0))[0]
  if (fastestRising) {
    cards.push({
      id: 'rising',
      bucket: fastestRising.bucket,
      title: `${fastestRising.name} 관심 급증`,
      evidence: `${fastestRising.bucket} 키워드 · 직전 7일 대비 +${fastestRising.changePct}%`,
      keyword: fastestRising.name,
    })
  }

  const newKeywords = keywords.filter(keyword => classifyKeyword(keyword) === 'new')
  if (newKeywords.length > 0) {
    const newByBucket = new Map<TagBucket, KeywordItem[]>()
    for (const keyword of newKeywords) {
      newByBucket.set(keyword.bucket, [...(newByBucket.get(keyword.bucket) ?? []), keyword])
    }
    const [bucket, bucketKeywords] = [...newByBucket.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko-KR'))[0]
    const representative = [...bucketKeywords].sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))[0]
    cards.push({
      id: 'new',
      bucket,
      title: `${bucket} 신규 흐름 유입`,
      evidence: `${representative.name} 등 신규 ${bucketKeywords.length.toLocaleString()}개 진입`,
      keyword: representative.name,
    })
  }

  const highlightedBuckets: TagBucket[] = ['정책·규제', '시장·산업']
  const highlight = highlightedBuckets
    .map(bucket => {
      const rising = keywords.filter(keyword => keyword.bucket === bucket && classifyKeyword(keyword) === 'rising')
      const documentCount = rising.reduce((sum, keyword) => sum + (keyword.cur ?? keyword.count), 0)
      const representative = [...rising].sort(
        (a, b) => (b.changePct ?? 0) - (a.changePct ?? 0) || (b.cur ?? 0) - (a.cur ?? 0)
      )[0]
      return { bucket, rising, documentCount, representative }
    })
    .filter(item => item.representative)
    .sort((a, b) => b.rising.length - a.rising.length || b.documentCount - a.documentCount)[0]
  if (highlight?.representative) {
    cards.push({
      id: 'highlight',
      bucket: highlight.bucket,
      title: highlight.bucket === '정책·규제' ? '정책·규제 이슈 주목' : '시장 흐름 변화 주목',
      evidence: `${highlight.representative.name} 중심 · 상승 키워드 ${highlight.rising.length.toLocaleString()}개`,
      keyword: highlight.representative.name,
    })
  }

  return cards.slice(0, 3)
}

function keywordChangeIcon(card: KeywordChangeCard) {
  if (card.id === 'rising') return TrendingUp
  if (card.id === 'new') return Sparkles
  if (card.bucket === '정책·규제') return Landmark
  if (card.bucket === '시장·산업') return ChartNoAxesColumnIncreasing
  if (card.bucket === '기업·기관') return Building2
  return Cpu
}

// ─── 보드 ──────────────────────────────────────────────────────────────────────

export default function AiInsightBoard({
  initialView,
  dailyInsights,
  dailyInsightWeeks,
  selectedWeek,
  isLatestWeek,
  weekTotal,
  weekNewCount,
  weekCategoryCoverage,
  insightGroups,
  contentMap,
  trendingTopics,
  keywordAggregationError,
  classifiedKeywords,
  kwStrip,
  issueCards,
  bucketByTopic,
  entities,
  allEntities,
  initialCenter,
  totalByType,
  signalItems,
  keywordDailySeries,
  isAdmin,
}: AiInsightBoardProps) {
  const searchParams = useSearchParams()
  const [keywordRankingMode, setKeywordRankingMode] = useState<KeywordRankingMode>('rising')

  // view는 로컬 state로 들고 있지 않고 매 렌더마다 실제 URL에서 직접 파생시킨다.
  // 뒤로가기로 이 페이지가 복원될 때 Next 라우터 캐시가 스테일한 initialView를
  // 줄 수 있는데(§지시서f에서 발견한 잔여 원인), useSearchParams()는 캐시 상태와
  // 무관하게 항상 브라우저의 실제 현재 URL과 동기화되므로 이 문제가 구조적으로
  // 재발할 수 없다. (원인 확정 2차, 2026-07-09)
  const rawView = searchParams.get('view')
  let resolvedView: AiInsightViewId = VALID_VIEW_IDS.includes(rawView as AiInsightViewId)
    ? (rawView as AiInsightViewId)
    : initialView
  // 실험실(관리자 전용) 뷰는 비관리자에게 노출 금지 → 기본 탭으로 폴백
  if (!isAdmin && LAB_VIEW_IDS.includes(resolvedView)) resolvedView = 'brief'
  const view = resolvedView

  // 키워드 분석 카드용 정렬 — 원본 signalItems(신호 수 순)는 건드리지 않고 이 뷰에서만 콘텐츠 수 내림차순으로 재정렬
  const keywordCardItems = useMemo(
    () => [...signalItems].sort((a, b) => b.contentCount - a.contentCount),
    [signalItems]
  )
  const maxKeywordContentCount = useMemo(
    () => Math.max(1, ...keywordCardItems.map(item => item.contentCount)),
    [keywordCardItems]
  )

  const keywordByName = new Map(
    classifiedKeywords.map(keyword => [keyword.name.toLocaleLowerCase('ko-KR'), keyword])
  )
  const keywordTrendCounts = {
    rising: 0,
    new: 0,
    sustained: 0,
    falling: 0,
  }
  for (const keyword of classifiedKeywords) {
    const trendClass = classifyKeyword(keyword)
    if (trendClass !== 'none') keywordTrendCounts[trendClass] += 1
  }
  const keywordChangeCards = buildKeywordChangeCards(classifiedKeywords)

  const rankedKeywords = rankKeywords(classifiedKeywords, keywordRankingMode)
  const headerMeta = TAB_HEADER_META[view]

  return (
    <>
      {/* 공통 페이지 헤더(핵심 인사이트·키워드 분석·관계지도) */}
      {headerMeta && <PageHeader title={headerMeta.title} description={headerMeta.description} />}

      <div className="space-y-6">
      {/* 하위 카테고리 탭(핵심 인사이트·키워드 분석·관계지도)은 DashboardHeader의
          sticky L2 행으로 이동(372) — 이 보드는 view 상태만 URL에서 읽는다. */}

      {/* 핵심 인사이트 — 주간 daily_insights 목록(§2, 지시서 20260715 주간 복귀) */}
      {view === 'brief' && (
        <div className="space-y-4">
          <WeeklyInsightHeader
            weeks={dailyInsightWeeks}
            selectedWeek={selectedWeek}
            total={weekTotal}
            newCount={weekNewCount}
            categoryCoverage={weekCategoryCoverage}
          />
          <DailyInsightList insights={dailyInsights} isLatestWeek={isLatestWeek} />
        </div>
      )}

      {/* 헤드라인 분석 */}
      {view === 'headline' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점
          </p>
          <InsightCardsSectionClient
            groups={insightGroups}
            contentMap={contentMap}
            bucketByTopic={bucketByTopic}
          />
        </section>
      )}

      {/* 뜨는 토픽 */}
      {view === 'trending' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            이번 주 가장 빠르게 늘어난 주제 — 직전 주 대비
          </p>
          {trendingTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">이번 주 집계 데이터가 없습니다.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {trendingTopics.map((t) => (
                <Link
                  key={t.group}
                  href={`/dashboard/topics/${encodeURIComponent(t.group)}`}
                  prefetch={false}
                  className="shrink-0 rounded-xl border border-border bg-card p-4 w-44 space-y-2 hover:border-brand-600/40 hover:bg-accent/40 transition-colors"
                >
                  <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{t.group}</p>
                  <div className="flex items-center gap-2">
                    {t.changePct === null ? (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">
                        NEW
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-positive">
                        ▲{t.changePct}%
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{t.cur}건</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {kwStrip.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="shrink-0 text-[11px] text-muted-foreground/60">키워드</span>
              {kwStrip.map((kw) => (
                <Link
                  key={kw.name}
                  href={`/dashboard/keywords/${encodeURIComponent(kw.name)}`}
                  prefetch={false}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-0.5 rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80',
                    BUCKET_CHIP_CLS[kw.bucket]
                  )}
                >
                  {kw.direction && (
                    <span className={cn(
                      'font-semibold leading-none',
                      kw.direction === '▲' ? 'text-positive' : 'text-negative'
                    )}>
                      {kw.direction}
                    </span>
                  )}
                  {kw.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 이슈 타임라인 */}
      {view === 'issues' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            추적 이슈의 변화 — 건수·논조 변동을 확인합니다
          </p>
          <IssueBoardClient cards={issueCards} showLensSwitcher={false} />
        </section>
      )}

      {/* 관계지도 */}
      {view === 'graph' && (
        <EntitiesPageClient
          initialCenter={initialCenter}
          entities={entities}
          allEntities={allEntities}
          totalByType={totalByType}
          showLensSwitcher={false}
        />
      )}

      {/* 키워드 분석 — 351-A: 기존 엔티티 카드 + 급상승 키워드 랭킹 */}
      {view === 'keyword' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">키워드 흐름</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                완료된 7일 기준 · 이전 7일과 비교
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              기간
              <select
                defaultValue="7d"
                aria-label="키워드 분석 기간"
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground"
              >
                <option value="today" disabled>오늘</option>
                <option value="7d">완료된 7일</option>
                <option value="30d" disabled>최근 30일</option>
              </select>
            </label>
          </div>

          {keywordAggregationError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {keywordAggregationError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              { label: '급상승', count: keywordTrendCounts.rising, dot: 'bg-positive' },
              { label: '신규', count: keywordTrendCounts.new, dot: 'bg-foreground' },
              { label: '관심 지속', count: keywordTrendCounts.sustained, dot: 'bg-blue-500' },
              { label: '하락', count: keywordTrendCounts.falling, dot: 'bg-negative' },
            ].map(metric => (
              <div key={metric.label} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', metric.dot)} />
                  {metric.label}
                </span>
                <strong className="text-base tabular-nums text-foreground">{metric.count}</strong>
              </div>
            ))}
          </div>

          {keywordChangeCards.length > 0 && (
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">오늘의 주요 변화</h3>
                <span className="text-[11px] text-muted-foreground">완료된 7일 데이터 규칙 기반 요약</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {keywordChangeCards.map(card => {
                  const Icon = keywordChangeIcon(card)
                  return (
                    <Link
                      key={card.id}
                      href={`/dashboard/keywords/${encodeURIComponent(card.keyword)}`}
                      prefetch={false}
                      className={cn(
                        'group rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        BUCKET_ACCENT_CLS[card.bucket]
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={cn('inline-flex size-8 items-center justify-center rounded-lg', BUCKET_CHIP_CLS[card.bucket])}>
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="text-sm text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.evidence}</p>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
            <div className="min-w-0">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  엔티티별 시그널 요약 · 콘텐츠가 많은 순
                </p>
              </div>
              {keywordCardItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  시그널 데이터가 있는 엔티티가 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                  {keywordCardItems.map(item => {
                    const barPct = Math.round((item.contentCount / maxKeywordContentCount) * 100)
                    const keyword = keywordByName.get(item.name.toLocaleLowerCase('ko-KR'))
                    const bucket = keyword?.bucket ?? entityTypeToBucket(item.entityType)
                    const showsTrend = keyword?.isNew || keyword?.direction === '▲'

                    return (
                      <Link
                        key={item.entityId}
                        href={`/dashboard/keywords/${encodeURIComponent(item.name)}`}
                        prefetch={false}
                        aria-label={`${item.name}, 콘텐츠 ${item.contentCount.toLocaleString()}건`}
                        className={cn(
                          'block rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          BUCKET_ACCENT_CLS[bucket],
                          showsTrend && 'ring-1 ring-foreground/15'
                        )}
                      >
                        <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 text-sm font-semibold leading-snug text-foreground line-clamp-1">
                            {item.name}
                          </p>
                          {keyword?.isNew ? (
                            <span className="shrink-0 rounded border border-foreground/30 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                              NEW
                            </span>
                          ) : keyword?.direction === '▲' ? (
                            <span className="shrink-0 rounded border border-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                              ▲ {keyword.changePct}%
                            </span>
                          ) : null}
                        </div>
                        <div className="mb-2 h-[3px] w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', BUCKET_BAR_CLS[bucket])}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            시그널 {item.signalCount.toLocaleString()} · 콘텐츠 {item.contentCount.toLocaleString()}
                          </p>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', BUCKET_CHIP_CLS[bucket])}>
                            {bucket}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            <aside className="self-start rounded-xl border border-border bg-card p-4 lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">급상승 랭킹</h3>
                <span className="text-[11px] text-muted-foreground">Top 10</span>
              </div>

              <div className="mt-3 grid grid-cols-3 rounded-lg bg-muted p-1" role="tablist" aria-label="키워드 랭킹 기준">
                {KEYWORD_RANKING_TABS.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={keywordRankingMode === tab.id}
                    onClick={() => setKeywordRankingMode(tab.id)}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                      keywordRankingMode === tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {rankedKeywords.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  해당 기준의 키워드가 없습니다.
                </p>
              ) : (
                <ol className="mt-3 divide-y divide-border">
                  {rankedKeywords.map((keyword, index) => {
                    const href = `/dashboard/keywords/${encodeURIComponent(keyword.name)}`

                    return (
                      <li key={keyword.name}>
                        <Link
                          href={href}
                          prefetch={false}
                          className="group grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem_auto] items-center gap-2 py-3"
                        >
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className={cn('size-1.5 shrink-0 rounded-full', BUCKET_DOT_CLS[keyword.bucket])} />
                              <span className="truncate text-sm font-medium text-foreground group-hover:underline">
                                {keyword.name}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              관련 문서 {(keyword.cur ?? keyword.count).toLocaleString()}건
                            </span>
                          </span>
                          {keywordDailySeries[keyword.name]?.length ? (
                            <KeywordSparkline
                              points={keywordDailySeries[keyword.name]}
                              label={keyword.name}
                            />
                          ) : (
                            <span aria-hidden="true" />
                          )}
                          {keyword.isNew ? (
                            <span className="rounded border border-foreground/30 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                              NEW
                            </span>
                          ) : (keyword.changePct ?? 0) > 0 ? (
                            <span className="text-[11px] font-semibold tabular-nums text-foreground">
                              ▲ {keyword.changePct}%
                            </span>
                          ) : (keyword.changePct ?? 0) < 0 ? (
                            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                              ▽ {Math.abs(keyword.changePct ?? 0)}%
                            </span>
                          ) : (
                            <span className="text-[11px] tabular-nums text-muted-foreground">0%</span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </aside>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/70">범례</span>
            {TAG_BUCKETS.map(bucket => (
              <span key={bucket} className="inline-flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', BUCKET_DOT_CLS[bucket])} />
                {bucket}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded border border-foreground/20 px-1.5 py-0.5 text-foreground">
              ▲ 32% 상승
            </span>
            <span className="inline-flex items-center rounded border border-foreground/30 px-1.5 py-0.5 font-bold text-foreground">
              NEW
            </span>
          </div>
        </section>
      )}
      </div>
    </>
  )
}
