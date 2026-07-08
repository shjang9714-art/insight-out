'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import type { EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BUCKET_CHIP_CLS, type KeywordItem, type TagBucket } from '@/lib/tag-buckets'
import InsightBriefCard from '@/components/analysis/InsightBriefCard'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
import EntitiesPageClient from '@/components/entities/EntitiesPageClient'
import ScopeFilter from '@/components/analysis/ScopeFilter'
import type { IssueCard } from '@/lib/issues/activity'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

// InsightBrief 인라인 정의 — server-only 모듈 import 회피
interface InsightBrief {
  keyChanges: string[]
  risks: string[]
  keywords: string[]
  myImplication: string | null
  source: 'rule' | 'llm'
}

export interface TopicTrend {
  group: string
  cur: number
  prev: number
  changePct: number | null
}

export type AiInsightViewId = 'brief' | 'headline' | 'trending' | 'issues' | 'graph'

export interface AiInsightBoardProps {
  initialView: AiInsightViewId
  brief: InsightBrief
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
}

// ─── 하위 카테고리 탭 ──────────────────────────────────────────────────────────

const TABS: { id: AiInsightViewId; label: string }[] = [
  { id: 'brief',    label: '핵심 Insight' },
  { id: 'headline', label: '헤드라인 분석' },
  { id: 'trending', label: '뜨는 토픽' },
  { id: 'issues',   label: '이슈 타임라인' },
  { id: 'graph',    label: '관계지도' },
]

// ─── 보드 ──────────────────────────────────────────────────────────────────────

export default function AiInsightBoard({
  initialView,
  brief,
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
}: AiInsightBoardProps) {
  const [view, setView] = useState<AiInsightViewId>(initialView)

  function handleTabChange(v: AiInsightViewId) {
    setView(v)
    // 풀 네비게이션 없이 URL만 갱신 (공유·새로고침 대비)
    history.replaceState(null, '', `?view=${v}`)
  }

  return (
    <div className="space-y-6">
      {/* 하위 카테고리 탭 */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={cn(
              'flex-1 rounded-xl border px-3 py-3.5 text-center text-base font-semibold transition-colors',
              view === t.id
                ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 범위 필터 (전체/내 관심사) */}
      <div className="flex justify-end">
        <ScopeFilter />
      </div>

      {/* 브리핑 요약 */}
      {view === 'brief' && <InsightBriefCard brief={brief} />}

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
    </div>
  )
}
