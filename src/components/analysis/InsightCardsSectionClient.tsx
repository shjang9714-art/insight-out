'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Quote, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  LENS_PRESETS,
  type LensTarget,
} from '@/lib/lens'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import InsightCardNewsList from './InsightCardNewsList'

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

type InsightView = 'cardnews' | 'analysis'
const VIEW_KEY = 'io:insight-view'

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

interface Props {
  groups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
}

export default function InsightCardsSectionClient({ groups, contentMap }: Props) {
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()
  const [view, setView] = useState<InsightView>(() => {
    if (typeof window === 'undefined') return 'cardnews'
    try {
      const saved = localStorage.getItem(VIEW_KEY) as InsightView | null
      if (saved === 'analysis' || saved === 'cardnews') return saved
    } catch { /* noop */ }
    return 'cardnews'
  })

  function handleViewChange(v: InsightView) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* noop */ }
  }

  // 미설정 여부 판단
  const hasSetting =
    activeLens === 'mine'  ? ctx.serviceIds.length > 0 :
    activeLens === 'watch' ? ctx.watchlist.length > 0  : true

  // 렌즈 필터/정렬 — 두 뷰 공유
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

  const totalCount = visibleGroups.reduce((sum, g) => sum + g.displayedCards.length, 0)

  // ─── 뷰 토글 ───────────────────────────────────────────────────────────────
  const toggle = (
    <div className="mb-4 flex justify-end">
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
        <button
          onClick={() => handleViewChange('cardnews')}
          aria-label="카드 뷰"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            view === 'cardnews'
              ? 'bg-brand-600 text-white'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="h-3.5 w-3.5" />
          카드
        </button>
        <button
          onClick={() => handleViewChange('analysis')}
          aria-label="목록 뷰"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            view === 'analysis'
              ? 'bg-brand-600 text-white'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          목록
        </button>
      </div>
    </div>
  )

  // ─── 카드뉴스 뷰 ────────────────────────────────────────────────────────────
  if (view === 'cardnews') {
    return (
      <div>
        {toggle}
        <InsightCardNewsList
          visibleGroups={visibleGroups}
          contentMap={contentMap}
          activeLens={activeLens}
          hasSetting={hasSetting}
          totalCount={totalCount}
          onResetLens={() => setActiveLens('all')}
        />
      </div>
    )
  }

  // ─── 분석 뷰 (기존 그리드 보존) ────────────────────────────────────────────
  if (visibleGroups.length === 0) {
    return (
      <div>
        {toggle}
        <div className="rounded-lg border border-dashed p-12 text-center">
          {activeLens === 'all' ? (
            <>
              <p className="text-sm font-medium text-muted-foreground">AI 인사이트 생성 대기 중</p>
              <p className="mt-1 text-xs text-muted-foreground">
                어드민에서 인사이트 카드를 생성하면 이곳에 표시됩니다.
              </p>
            </>
          ) : !hasSetting ? (
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
                설정하신 담당/관심 기업 관련 인사이트가 아직 없어요.
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
      </div>
    )
  }

  return (
    <div>
      {toggle}

      {/* 보기 결과 요약 */}
      {activeLens !== 'all' && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-600">
            {LENS_PRESETS[activeLens].label} · {totalCount}건
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
                      {matched && (
                        <div className="flex items-center gap-1.5">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-brand-600/10 text-brand-600">
                            관심 표시
                          </span>
                        </div>
                      )}
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
    </div>
  )
}
