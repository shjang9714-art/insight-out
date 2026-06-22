'use client'

import Link from 'next/link'
import { Quote } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  type LensTarget,
} from '@/lib/lens'
import type { InsightCard, InsightCardCitation } from '@/lib/types'

// ─── 직렬화 가능 타입 ──────────────────────────────────────────────────────────

export interface ContentMetaRecord {
  title: string
  category: string | null
  sourceName: string | null
}

export interface InsightGroup {
  key: string   // `${period_start}|${period_end}`
  start: string
  end: string
  cards: InsightCard[]
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

interface Props {
  groups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
}

export default function InsightCardsSectionClient({ groups, contentMap }: Props) {
  const ctx = useLensContext()
  const [activeLens] = useActiveLens()

  const visibleGroups = groups.map((g, idx) => {
    const lensedCards = g.cards
      .map(card => {
        const target: LensTarget = { names: [card.topic, card.headline] }
        const score   = lensScore(activeLens, ctx, target)
        const matched = activeLens !== 'all' && matchesLens(activeLens, ctx, target)
        return { card, score, matched }
      })
      .sort((a, b) => b.score - a.score)

    const displayed = activeLens === 'all'
      ? lensedCards
      : lensedCards.filter(({ matched }) => matched)

    return { ...g, displayedCards: displayed, isLatest: idx === 0 }
  }).filter(g => g.displayedCards.length > 0)

  if (visibleGroups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        {activeLens === 'all' ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">AI 인사이트 생성 대기 중</p>
            <p className="mt-1 text-xs text-muted-foreground">
              어드민에서 인사이트 카드를 생성하면 이곳에 표시됩니다.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">현재 렌즈 조건에 해당하는 인사이트가 없습니다.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {visibleGroups.map(({ key, start, end, displayedCards, isLatest }) => (
        <div key={key} className={cn(!isLatest && 'opacity-70')}>
          <div className="mb-3 flex items-center gap-3">
            <span className={cn(
              'text-sm font-medium',
              isLatest ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {formatPeriod(start, end)}
            </span>
            {isLatest && (
              <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">최신</span>
            )}
            {!isLatest && (
              <span className="text-[11px] text-muted-foreground/60">이전 인사이트</span>
            )}
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {displayedCards.map(({ card, matched }) => {
              const citations = card.citations as InsightCardCitation[]
              return (
                <article
                  key={card.id}
                  className={cn(
                    'rounded-xl border bg-card p-5 space-y-3',
                    matched ? 'border-brand-600/20' : 'border-border'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded px-2 py-0.5 text-xs font-medium bg-brand-600/10 text-brand-600">
                      {card.topic}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {matched && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-brand-600/10 text-brand-600">
                          내 관련
                        </span>
                      )}
                      <Link
                        href={`/dashboard/reports/new?type=시장동향&topic=${encodeURIComponent(card.topic ?? '')}`}
                        className="rounded px-2 py-0.5 text-[11px] font-medium bg-brand-600/10 text-brand-600 hover:bg-brand-600/20 transition-colors"
                      >
                        보고서로 만들기
                      </Link>
                    </div>
                  </div>

                  <p className="text-base font-semibold text-foreground leading-snug">
                    {card.headline}
                  </p>

                  {card.implication && (
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        시사점
                      </span>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {card.implication}
                      </p>
                    </div>
                  )}

                  {citations.length > 0 ? (
                    <div className="space-y-2 pt-1 border-t border-border">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        근거
                      </span>
                      <ul className="space-y-2">
                        {citations.map((c, i) => {
                          const meta = contentMap[c.content_id]
                          return (
                            <li key={i} className="flex gap-2">
                              <Quote className="h-3 w-3 mt-0.5 shrink-0 text-brand-600/40" />
                              <div className="min-w-0">
                                <p className="text-xs text-muted-foreground italic leading-snug">
                                  &ldquo;{c.quote}&rdquo;
                                </p>
                                {meta ? (
                                  <Link
                                    href={`/dashboard/contents/${c.content_id}`}
                                    className="mt-0.5 block text-[11px] text-brand-600 hover:underline truncate"
                                  >
                                    {meta.title}
                                  </Link>
                                ) : (
                                  <span className="mt-0.5 block text-[11px] text-muted-foreground/60 truncate">
                                    출처 비공개
                                  </span>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : card.source_content_ids.length > 0 ? (
                    <div className="space-y-1.5 pt-1 border-t border-border">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        근거
                      </span>
                      <ul className="space-y-1">
                        {card.source_content_ids.slice(0, 5).map((id) => {
                          const meta = contentMap[id]
                          return meta ? (
                            <li key={id}>
                              <Link
                                href={`/dashboard/contents/${id}`}
                                className="block text-xs text-brand-600 hover:underline truncate"
                              >
                                {meta.title}
                              </Link>
                            </li>
                          ) : null
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
