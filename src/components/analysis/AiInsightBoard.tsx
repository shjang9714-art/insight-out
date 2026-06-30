'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { TrendingUp, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BUCKET_CHIP_CLS, type KeywordItem, type TagBucket } from '@/lib/tag-buckets'
import InsightBriefCard from '@/components/analysis/InsightBriefCard'
import InsightCardsSectionClient, {
  type InsightGroup,
  type ContentMetaRecord,
} from '@/components/analysis/InsightCardsSectionClient'
import IssueBoardClient from '@/components/issues/IssueBoardClient'
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

export interface AiInsightBoardProps {
  initialView: 'briefing' | 'issues'
  brief: InsightBrief
  insightGroups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  trendingTopics: TopicTrend[]
  kwStrip: KeywordItem[]
  issueCards: IssueCard[]
  bucketByTopic: Record<string, TagBucket>
}

type ViewId = 'briefing' | 'issues'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'briefing', label: '브리핑' },
  { id: 'issues',   label: '이슈'   },
]

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-0.5">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  )
}

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
}: AiInsightBoardProps) {
  const [view, setView] = useState<ViewId>(initialView)

  function handleTabChange(v: ViewId) {
    setView(v)
    // 풀 네비게이션 없이 URL만 갱신 (공유·새로고침 대비)
    history.replaceState(null, '', `?view=${v}`)
  }

  return (
    <div className="space-y-6">
      {/* 탭 */}
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={cn(
              'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
              view === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 브리핑 탭 */}
      {view === 'briefing' && (
        <div className="space-y-10">
          <InsightBriefCard brief={brief} />

          <section>
            <SectionHeader
              icon={<FileText className="h-4 w-4 text-brand-600" />}
              title="AI 인사이트"
              desc="이번 주 읽어야 할 결론 — AI가 분석한 헤드라인과 시사점"
            />
            <InsightCardsSectionClient
              groups={insightGroups}
              contentMap={contentMap}
              bucketByTopic={bucketByTopic}
            />
          </section>

          <section>
            <SectionHeader
              icon={<TrendingUp className="h-4 w-4 text-brand-600" />}
              title="이번 주 뜨는 토픽"
              desc="이번 주 가장 빠르게 늘어난 주제 — 직전 주 대비"
            />
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
        </div>
      )}

      {/* 이슈 탭 */}
      {view === 'issues' && (
        <section>
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4 text-risk" />}
            title="시장 주요 이슈"
            desc="추적 이슈의 변화 — 건수·논조 변동을 확인합니다"
          />
          <IssueBoardClient cards={issueCards} showLensSwitcher={false} />
        </section>
      )}
    </div>
  )
}
