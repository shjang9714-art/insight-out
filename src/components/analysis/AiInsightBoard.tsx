'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BUCKET_CHIP_CLS, type KeywordItem, type TagBucket } from '@/lib/tag-buckets'
import KeyInsightArchive from '@/components/key-insights/KeyInsightArchive'
import type { KeyInsightRow } from '@/lib/key-insights/types'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import EntitiesPageClient from '@/components/entities/EntitiesPageClient'
import ScopeFilter from '@/components/analysis/ScopeFilter'
import type { IssueCard } from '@/lib/issues/activity'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'

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
  keyInsightWeeks: string[]
  keyInsightWeekOf: string | null
  keyInsightCards: KeyInsightRow[]
  insightGroups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  trendingTopics: TopicTrend[]
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

// ─── 보드 ──────────────────────────────────────────────────────────────────────

export default function AiInsightBoard({
  initialView,
  keyInsightWeeks,
  keyInsightWeekOf,
  keyInsightCards,
  insightGroups,
  contentMap,
  trendingTopics,
  kwStrip,
  issueCards,
  bucketByTopic,
  entities,
  allEntities,
  initialCenter,
  totalByType,
  signalItems,
  isAdmin,
}: AiInsightBoardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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

  function handleTabChange(v: AiInsightViewId) {
    router.replace(`${pathname}?view=${v}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      {/* 하위 카테고리 탭 — L1 그룹 폭(--nav-group-w) 기준 좌측블록 안에서 center → L1 중앙 아래 정렬(233) */}
      {/* 실험실(관리자 전용)은 DashboardHeader.tsx의 5탭 네비 줄로 이동(2026-07-10) —
          여기서는 항상 노출되는 3개 탭만 렌더링 */}
      <div className="-mt-3 w-[var(--nav-group-w)]">
        <InsightViewTabs items={PRIMARY_TABS} value={view} onChange={handleTabChange} className="w-full" />
      </div>

      {/* 범위 필터 (전체/내 관심사) */}
      <div className="flex justify-end">
        <ScopeFilter />
      </div>

      {/* 핵심 Insight — 주간 배치 아카이브(§2-2) */}
      {view === 'brief' && (
        <KeyInsightArchive
          initialWeeks={keyInsightWeeks}
          initialWeekOf={keyInsightWeekOf}
          initialCards={keyInsightCards}
        />
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
                  href={`/dashboard/topics/${encodeURIComponent(kw.name)}`}
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

      {/* 키워드 분석 — 엔티티별 시그널 요약(구 기업동향 브리핑, 224B) */}
      {view === 'keyword' && (
        <section>
          <p className="mb-4 text-xs text-muted-foreground">엔티티별 시그널 요약 — 신호가 많은 순</p>
          {signalItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              시그널 데이터가 있는 엔티티가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {signalItems.map(item => {
                const typeLabel = ENTITY_TYPE_LABEL[item.entityType]
                const displayDate = item.lastSeen
                  ? new Date(item.lastSeen).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
                    })
                  : null
                const topSignals = item.signalTypes.slice(0, 3)
                return (
                  <Link
                    key={item.entityId}
                    href={`/dashboard/entities/${item.entityId}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-600/40"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
                        {item.name}
                      </span>
                      <span className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        item.isCompetitor && item.entityType === 'company'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-border bg-muted text-muted-foreground'
                      )}>
                        {typeLabel}
                      </span>
                    </div>

                    {topSignals.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {topSignals.map(sig => (
                          <span
                            key={sig}
                            className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>시그널 {item.signalCount.toLocaleString()}건</span>
                      <span>콘텐츠 {item.contentCount.toLocaleString()}건</span>
                      {displayDate && <span className="ml-auto">{displayDate}</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
