'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BUCKET_CHIP_CLS, type KeywordItem, type TagBucket } from '@/lib/tag-buckets'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import type { IssueCard } from '@/lib/issues/activity'
import type { TopicTrend } from '@/components/analysis/AiInsightBoard'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import CouncilWorkspace from '@/components/dashboard/CouncilWorkspace'
import { LAB_TABS, LAB_VIEW_IDS, type LabViewId } from '@/lib/lab/tabs'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import CompetitorNewsGroups from '@/components/entities/CompetitorNewsGroups'
import CompetitorWeeklyList from '@/components/entities/CompetitorWeeklyList'
import CompetitorWeeklyTimeline from '@/components/entities/CompetitorWeeklyTimeline'
import EntitySectionHeader from '@/components/entities/EntitySectionHeader'
import type { CompetitorNewsData } from '@/lib/entities/competitor-news'
import type {
  CompetitorWeeklyCardRow,
  CompetitorWeeklyTimelineEntry,
} from '@/lib/competitor-weekly/query'

// 실험실(관리자 전용) 페이지 — 숨김 처리된 하위탭을 모아 확인하는 곳.
// 현재: 헤드라인 분석/뜨는 토픽/이슈 타임라인(AiInsightBoard.tsx 의 LAB_TABS 이관) +
// 경쟁사 최근 뉴스/경쟁사 주간 브리핑(기업동향 L2에서 이관, entities/page.tsx의
// CompetitorView·CompetitorTrendView와 동일 컴포넌트·데이터 소스 재사용).
// 앞으로 생길 실험 탭은 LAB_TABS 배열에 추가 + 아래 렌더 분기만 추가하면 됨.

export interface LabBoardProps {
  initialView: LabViewId
  insightGroups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  bucketByTopic: Record<string, TagBucket>
  trendingTopics: TopicTrend[]
  kwStrip: KeywordItem[]
  issueCards: IssueCard[]
  competitorNews: CompetitorNewsData
  weeklyReports: CompetitorWeeklyCardRow[]
  weeklyTimeline: CompetitorWeeklyTimelineEntry[]
  error?: string
}

export default function LabBoard({
  initialView,
  insightGroups,
  contentMap,
  bucketByTopic,
  trendingTopics,
  kwStrip,
  issueCards,
  competitorNews,
  weeklyReports,
  weeklyTimeline,
  error,
}: LabBoardProps) {
  const view: LabViewId = LAB_VIEW_IDS.includes(initialView) ? initialView : 'headline'
  const safeInsightGroups = (Array.isArray(insightGroups) ? insightGroups : []).map((group) => ({
    ...group,
    cards: (Array.isArray(group.cards) ? group.cards : []).map((card) => ({
      ...card,
      source_content_ids: Array.isArray(card.source_content_ids) ? card.source_content_ids : [],
      citations: Array.isArray(card.citations) ? card.citations : [],
    })),
  }))
  const safeContentMap = contentMap && typeof contentMap === 'object' ? contentMap : {}
  const safeBucketByTopic = bucketByTopic && typeof bucketByTopic === 'object' ? bucketByTopic : {}
  const safeTrendingTopics = Array.isArray(trendingTopics) ? trendingTopics : []
  const safeKwStrip = Array.isArray(kwStrip) ? kwStrip : []
  const safeIssueCards = (Array.isArray(issueCards) ? issueCards : []).map((card) => ({
    ...card,
    topKeywords: Array.isArray(card.topKeywords) ? card.topKeywords : [],
  }))
  const safeCompetitorNews: CompetitorNewsData = competitorNews ?? {
    competitorCount: 0,
    groups: [],
    overallImpactDist: { 위기: 0, 기회: 0, 관망: 0 },
  }
  const safeWeeklyReports = Array.isArray(weeklyReports) ? weeklyReports : []
  const safeWeeklyTimeline = Array.isArray(weeklyTimeline) ? weeklyTimeline : []
  const COMPETITOR_SUMMARY_CAP = 6
  const hasImpactSignal =
    safeCompetitorNews.overallImpactDist['위기'] + safeCompetitorNews.overallImpactDist['기회'] > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            실험실
          </span>
          <p className="text-xs text-muted-foreground">
            관리자 전용 — 숨김 처리된 하위 카테고리를 확인하는 페이지입니다
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">실험실 데이터 오류</p>
          <p className="mt-1 break-words font-mono text-xs">{error}</p>
        </div>
      )}

      <InsightViewTabs
        items={LAB_TABS.map(t => ({ ...t, href: `/dashboard/lab?view=${t.id}` }))}
        value={view}
      />

      {/* 헤드라인 분석 */}
      {view === 'headline' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점
          </p>
          <InsightCardsSectionClient
            groups={safeInsightGroups}
            contentMap={safeContentMap}
            bucketByTopic={safeBucketByTopic}
          />
        </section>
      )}

      {/* 뜨는 토픽 */}
      {view === 'trending' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            이번 주 가장 빠르게 늘어난 주제 — 직전 주 대비
          </p>
          {safeTrendingTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">이번 주 집계 데이터가 없습니다.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {safeTrendingTopics.map((t) => (
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

          {safeKwStrip.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="shrink-0 text-[11px] text-muted-foreground/60">키워드</span>
              {safeKwStrip.map((kw) => (
                <Link
                  key={kw.name}
                  href={`/dashboard/topics/${encodeURIComponent(kw.name)}`}
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
          <IssueBoardClient cards={safeIssueCards} showLensSwitcher={false} />
        </section>
      )}

      {/* AI 협의체 (베타) */}
      {view === 'council' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">
            베타 — MI 관점의 페르소나와 토론하는 AI 협의체(COUNCIL)를 임베드합니다
          </p>
          <CouncilWorkspace />
        </section>
      )}

      {/* 경쟁사 최근 뉴스 — entities/page.tsx CompetitorView와 동일 데이터·컴포넌트 */}
      {view === 'competitor' && (
        <section>
          {safeCompetitorNews.competitorCount === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              경쟁사 키워드를 등록하면 동향을 모아 보여줍니다.
            </div>
          ) : safeCompetitorNews.groups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              최근 14일 경쟁사 관련 기사가 없습니다.
            </div>
          ) : (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
                <p>최근 14일 · 경쟁사 관련 뉴스</p>
                <div className="flex items-center gap-2">
                  {hasImpactSignal && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">LG U+ 관점</span>
                      <LguImpactBadge impact="위기" count={safeCompetitorNews.overallImpactDist['위기']} />
                      <LguImpactBadge impact="기회" count={safeCompetitorNews.overallImpactDist['기회']} />
                    </div>
                  )}
                  {hasImpactSignal && <span aria-hidden className="text-border">·</span>}
                  <Link
                    href="/dashboard/entities/competitor-news"
                    prefetch={false}
                    className="font-medium text-foreground/70 transition-colors hover:text-brand-600"
                  >
                    전체 보기 →
                  </Link>
                </div>
              </div>

              <CompetitorNewsGroups
                groups={safeCompetitorNews.groups}
                capPerGroup={COMPETITOR_SUMMARY_CAP}
                seeAllHref="/dashboard/entities/competitor-news"
              />
            </div>
          )}
        </section>
      )}

      {/* 경쟁사 주간 브리핑 — entities/page.tsx CompetitorTrendView와 동일 데이터·컴포넌트 */}
      {view === 'trend' && (
        <section className="space-y-11">
          <CompetitorWeeklyTimeline entries={safeWeeklyTimeline} />

          <section>
            <EntitySectionHeader
              title="경쟁사 주간 브리핑"
              subtitle="매주 경쟁사(통신 3사 중심) 동향을 사업영역별로 종합한 브리핑"
              meta={safeWeeklyReports.length > 0 ? `브리핑 ${safeWeeklyReports.length}건` : undefined}
            />

            {safeWeeklyReports.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
                <p className="text-sm font-medium text-foreground">발행된 경쟁사 주간 브리핑이 아직 없습니다.</p>
                <p className="text-xs text-muted-foreground">
                  AI 생성·발행 후 이곳에 표시됩니다.
                </p>
              </div>
            ) : (
              <CompetitorWeeklyList reports={safeWeeklyReports} />
            )}
          </section>
        </section>
      )}
    </div>
  )
}
