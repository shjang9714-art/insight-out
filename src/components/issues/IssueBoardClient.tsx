'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  LENS_PRESETS,
  type LensTarget,
} from '@/lib/lens'
import LensSwitcher from '@/components/lens/LensSwitcher'
import type { IssueCard } from '@/lib/issues/activity'
import { buildIssueInsight, buildIssueRelevance } from '@/lib/issues/interpret'

// ─── 렌즈 배지 라벨 ────────────────────────────────────────────────────────────

function LensBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-medium text-brand-600">
      {label}
    </span>
  )
}

// ─── 정렬 옵션 ─────────────────────────────────────────────────────────────────

type SortKey = 'surge' | 'activity' | 'recent' | 'relevance' | 'attention'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'surge',     label: '증가율' },
  { key: 'activity',  label: '활동량' },
  { key: 'recent',    label: '최신' },
  { key: 'relevance', label: '내 관련도' },
  { key: 'attention', label: '주의' },
]
const SORT_STORAGE_KEY = 'io:issue-sort'

const ATTENTION_RANK: Record<string, number> = { worsening: 2, surge: 1 }
function attentionRank(card: IssueCard): number {
  return card.changeFlag ? (ATTENTION_RANK[card.changeFlag] ?? 0) : 0
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  cards: IssueCard[]
  showLensSwitcher?: boolean
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function IssueBoardClient({ cards, showLensSwitcher = true }: Props) {
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'surge'
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null
      if (saved && SORT_OPTIONS.some(o => o.key === saved)) return saved
    } catch { /* noop */ }
    return 'surge'
  })

  function handleSortChange(key: SortKey) {
    setSortBy(key)
    try { localStorage.setItem(SORT_STORAGE_KEY, key) } catch { /* noop */ }
  }

  const withLens = cards.map(card => {
    const target: LensTarget = { names: [card.title] }
    const score   = lensScore(activeLens, ctx, target)
    const matched = activeLens !== 'all' && matchesLens(activeLens, ctx, target)
    // 범위(activeLens) 무관하게 항상 계산되는 개인 관련도 — "내 관련도" 정렬 전용
    const relevanceScore = Math.max(
      lensScore('mine', ctx, target),
      lensScore('watch', ctx, target),
    )
    return { card, score, matched, relevanceScore }
  })

  const displayed =
    activeLens === 'all'
      ? withLens
      : withLens.filter(({ matched }) => matched)

  // 범위 필터(activeLens) 적용 결과 안에서 사용자가 고른 정렬 기준 적용
  const sorted = [...displayed].sort((a, b) => {
    switch (sortBy) {
      case 'activity':
        return b.card.recentCount - a.card.recentCount
      case 'recent': {
        const aMs = a.card.lastActivityAt ? new Date(a.card.lastActivityAt).getTime() : -Infinity
        const bMs = b.card.lastActivityAt ? new Date(b.card.lastActivityAt).getTime() : -Infinity
        return bMs - aMs
      }
      case 'relevance':
        return b.relevanceScore - a.relevanceScore
      case 'attention': {
        const diff = attentionRank(b.card) - attentionRank(a.card)
        return diff !== 0 ? diff : b.card.recentCount - a.card.recentCount
      }
      case 'surge':
      default: {
        const aVal = a.card.changePct === null ? Infinity : a.card.changePct
        const bVal = b.card.changePct === null ? Infinity : b.card.changePct
        return bVal - aVal
      }
    }
  })

  // 빈 결과 사유 판단
  const isMisconfigured =
    (activeLens === 'mine'  && ctx.serviceIds.length === 0) ||
    (activeLens === 'watch' && ctx.watchlist.length === 0)

  return (
    <div>
      {showLensSwitcher && (
        <div className="mb-4">
          <LensSwitcher />
        </div>
      )}

      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          시장 주요 이슈를 추적합니다.
          {cards.length > 0 && ` ${cards.length}개 이슈 모니터링 중`}
        </p>
      </div>

      {/* 보기 결과 요약 */}
      {activeLens !== 'all' && sorted.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-600">
            {LENS_PRESETS[activeLens].label} · {sorted.length}건
          </span>
          <button
            type="button"
            onClick={() => setActiveLens('all')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            전체 보기 →
          </button>
        </div>
      )}

      {/* 정렬 컨트롤 */}
      {sorted.length > 0 && (
        <div className="mb-4 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground/60">정렬:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSortChange(key)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                sortBy === key
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="rounded-lg border border-dashed p-16 text-center">
          {activeLens === 'all' ? (
            <p className="text-sm text-muted-foreground">아직 등록된 이슈가 없습니다.</p>
          ) : isMisconfigured ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                담당 서비스·관심 기업을 설정하면 여기에 모아 보여드려요.
              </p>
              <Link
                href="/dashboard/mypage"
                className="inline-block text-xs text-brand-600 hover:underline"
              >
                마이페이지에서 설정하기 →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                설정하신 담당/관심 기업 관련 이슈가 아직 없어요.
              </p>
              <button
                type="button"
                onClick={() => setActiveLens('all')}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                전체 보기로 전환
              </button>
            </div>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ card, matched }) => {
            const total14Days = card.recentCount + card.prevCount
            const sentimentTotal = card.sentimentPos + card.sentimentNeg
            const lensLabel =
              activeLens === 'mine'  ? '내 업무' :
              activeLens === 'watch' ? '내 관심사' : null

            return (
              <Link
                key={card.id}
                href={`/dashboard/issues/${card.id}`}
                className={cn(
                  'group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-brand-600/30 hover:bg-accent/40',
                  matched ? 'border-brand-600/20' : 'border-border'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
                    {card.title}
                  </h2>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {matched && lensLabel && <LensBadge label={lensLabel} />}
                    {card.changeFlag === 'worsening' && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-risk-soft px-2 py-0.5 text-[10px] font-medium text-risk">
                        ⚠ 논조 악화
                      </span>
                    )}
                    {card.changeFlag === 'surge' && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-risk-soft px-2 py-0.5 text-[10px] font-medium text-risk">
                        <TrendingUp className="h-3 w-3" />
                        {card.changePct === null ? '신규' : `+${card.changePct}%`}
                      </span>
                    )}
                  </div>
                </div>

                {card.summary && (
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {card.summary}
                  </p>
                )}

                {(() => {
                  const insight = buildIssueInsight(card)
                  const relevance = buildIssueRelevance(matched, activeLens)
                  return (
                    <div className="mb-3 space-y-1">
                      <p className={cn(
                        'text-[11px] leading-snug line-clamp-2',
                        insight.tone === 'risk'     ? 'text-risk' :
                        insight.tone === 'positive' ? 'text-positive' :
                        'text-muted-foreground'
                      )}>
                        {insight.why}
                      </p>
                      {relevance && (
                        <p className="text-[11px] text-brand-600 leading-snug">
                          {relevance}
                        </p>
                      )}
                    </div>
                  )
                })()}

                {card.topKeywords.length > 0 && (
                  <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                    {card.topKeywords.map((kw) => (
                      <Link
                        key={kw}
                        href={`/dashboard/topics/${encodeURIComponent(kw)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground"
                      >
                        {kw}
                      </Link>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    최근 7일 <span className="font-medium text-foreground">{card.recentCount}건</span>
                    {total14Days > card.recentCount && (
                      <span className="ml-1 opacity-60">/ 14일 {total14Days}건</span>
                    )}
                  </span>

                  {sentimentTotal > 0 && (
                    <div className="flex items-center gap-1">
                      {card.sentimentPos > 0 && (
                        <span className="rounded px-1.5 py-0.5 bg-positive-soft text-positive">
                          긍{card.sentimentPos}
                        </span>
                      )}
                      {card.sentimentNeg > 0 && (
                        <span className="rounded px-1.5 py-0.5 bg-negative-soft text-negative">
                          부{card.sentimentNeg}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
