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
import {
  computeImportance,
  computeRelevance,
  buildSelectionReason,
  computeRelatedKeywords,
  getCardDetailHref,
  IMPORTANCE_LABEL,
  IMPORTANCE_CLS,
  RELEVANCE_LABEL,
  RELEVANCE_CLS,
} from '@/lib/insight/card-meta'
import { BUCKET_CHIP_CLS, type TagBucket } from '@/lib/tag-buckets'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import AiMark from '@/components/ui/AiMark'
import InsightCardNewsList from './InsightCardNewsList'

// ─── 직렬화 가능 타입 ──────────────────────────────────────────────────────────

export interface ContentMetaRecord {
  title: string
  category: string | null
  sourceName: string | null
  matchedKeywords?: string[] | null
}

export interface InsightGroup {
  key: string   // `${period_start}|${period_end}` (기간 그룹) 또는 그룹명(라벨 그룹)
  start: string
  end: string
  cards: InsightCard[]
  /** 있으면 기간(formatPeriod) 대신 이 라벨을 섹션 헤더로 — 시간축이 아닌 그룹(예: 경쟁사 동향의 competitor_group)용(224) */
  label?: string
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

type InsightView = 'cardnews' | 'analysis'
const VIEW_KEY = 'io:insight-view'

function stripNullableText(text: string | null | undefined): string | null | undefined {
  return text ? stripLlmArtifacts(text) : text
}

function stripInsightCardText(card: InsightCard): InsightCard {
  return {
    ...card,
    headline: stripLlmArtifacts(card.headline),
    card_headline: stripNullableText(card.card_headline),
    implication: stripNullableText(card.implication) ?? null,
  }
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

interface Props {
  groups: InsightGroup[]
  contentMap: Record<string, ContentMetaRecord>
  bucketByTopic?: Record<string, TagBucket>
  /** 그룹을 박스 컨테이너(242 경쟁사 최근 뉴스 양식)로 감쌈 — label 그룹(예: 경쟁사 동향)용(243). 기본 false(기존 렌더 불변) */
  boxed?: boolean
}

export default function InsightCardsSectionClient({ groups, contentMap, bucketByTopic, boxed = false }: Props) {
  // 293 — LLM 서술 필드는 이 경계에서 통합 정제한다. 하위 카드 렌더러는 정제된 card만 받는다.
  const sanitizedGroups = groups.map((group) => ({
    ...group,
    cards: group.cards.map(stripInsightCardText),
  }))

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
  const hasSetting = activeLens === 'watch' ? ctx.watchlist.length > 0 : true

  // 개인화 설정 여부 (렌즈 무관) — 내 관련도 배지 표시 조건
  const hasPersonalization = ctx.watchlist.length > 0

  // 렌즈 필터/정렬 — 두 뷰 공유
  const visibleGroups = sanitizedGroups.map((g, idx) => {
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
              ? 'bg-brand-solid text-white'
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
              ? 'bg-brand-solid text-white'
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
          hasPersonalization={hasPersonalization}
          totalCount={totalCount}
          onResetLens={() => setActiveLens('all')}
          bucketByTopic={bucketByTopic}
          boxed={boxed}
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
                관심 기업을 설정하면 여기에 모아 보여드려요.
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
                설정하신 관심 기업 관련 인사이트가 아직 없어요.
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
        {visibleGroups.map(({ key, start, end, label, displayedCards, isLatest }) => (
          <div
            key={key}
            className={cn(
              boxed && 'rounded-2xl border border-border bg-card overflow-hidden',
              !boxed && !label && !isLatest && 'opacity-70'
            )}
          >
            {boxed ? (
              <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-b from-card to-muted/20 px-5 py-3">
                <span className="text-[15px] font-bold text-foreground">{label ?? formatPeriod(start, end)}</span>
                <span className="text-xs text-muted-foreground">{displayedCards.length}건</span>
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-3">
                <span className={cn(
                  'text-sm font-medium',
                  label || isLatest ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {label ?? formatPeriod(start, end)}
                </span>
                {label ? (
                  <span className="text-[11px] text-muted-foreground/60">{displayedCards.length}건</span>
                ) : isLatest ? (
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand-600/10 text-brand-600">최신</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/60">이전 인사이트</span>
                )}
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            <div className={cn('grid gap-4 sm:grid-cols-2', boxed && 'p-4 sm:p-5')}>
              {displayedCards.map(({ card, matched }) => {
                const citations = card.citations as InsightCardCitation[]
                const evidenceCount = citations.length || card.source_content_ids.length

                // 중요도 / 내 관련도 / 선정 이유
                const relevanceTarget: LensTarget = { names: [card.topic, card.headline] }
                const relevanceMatched = matchesLens('watch', ctx, relevanceTarget)
                const relevanceScore = lensScore('watch', ctx, relevanceTarget)
                const importance = computeImportance(card)
                const relevance  = computeRelevance(relevanceScore, relevanceMatched, hasPersonalization)
                const selectionReason = buildSelectionReason({
                  evidenceCount,
                  matched: relevanceMatched,
                  generatedAt: card.generated_at,
                })
                const detailHref = getCardDetailHref(card)

                return (
                  <article
                    key={card.id}
                    className={cn(
                      'rounded-xl border bg-card p-5 space-y-3',
                      matched ? 'border-brand-600/20' : 'border-border'
                    )}
                  >
                    {/* 1. 상단 배지 행: [카테고리][중요도][내 관련도] */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', BUCKET_CHIP_CLS[bucketByTopic?.[card.topic] ?? '그 외'])}>
                        {card.topic}
                      </span>
                      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', IMPORTANCE_CLS[importance])}>
                        {IMPORTANCE_LABEL[importance]}
                      </span>
                      {(relevance === 'high' || relevance === 'mid') && (
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', RELEVANCE_CLS[relevance])}>
                          {RELEVANCE_LABEL[relevance]}
                        </span>
                      )}
                    </div>

                    {/* 2. 제목 */}
                    <h3 className="text-base font-semibold leading-snug text-foreground">
                      <AiMark title="AI 생성 인사이트" className="mr-1" />
                      <Link
                        href={detailHref}
                        prefetch={false}
                        className="hover:text-brand-600 hover:underline"
                      >
                        {card.card_headline ?? card.headline}
                      </Link>
                    </h3>

                    {/* 3. 핵심 — card_headline이 있고 headline과 다를 때만 */}
                    {card.card_headline && card.card_headline !== card.headline && (
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                          핵심
                        </span>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {card.headline}
                        </p>
                      </div>
                    )}

                    {/* 4. 시사점 */}
                    {card.implication && (
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                          시사점
                        </span>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {card.implication}
                        </p>
                      </div>
                    )}

                    {/* 5. 왜 주목하나 */}
                    {selectionReason && (
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                          왜 주목하나
                        </span>
                        <p className="text-xs text-muted-foreground/60">
                          {selectionReason}
                        </p>
                      </div>
                    )}

                    {/* 6. 관련 키워드 (근거 콘텐츠 기반, 토픽 제외) */}
                    {(() => {
                      const relatedKeywords = computeRelatedKeywords(card, contentMap)
                      if (relatedKeywords.length === 0) return null
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground/60">관련 키워드:</span>
                          {relatedKeywords.map((kw) => (
                            <Link
                              key={kw}
                              href={`/dashboard/topics/${encodeURIComponent(kw)}`}
                              prefetch={false}
                              className="rounded px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground hover:text-foreground"
                            >
                              {kw}
                            </Link>
                          ))}
                        </div>
                      )
                    })()}

                    {/* 7. 액션 */}
                    <div>
                      <Link
                        href={detailHref}
                        prefetch={false}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        자세히 보기 →
                      </Link>
                    </div>

                    {/* 근거 (기존 유지) */}
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
                                      prefetch={false}
                                      target="_blank"
                                      rel="noopener"
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
                                  prefetch={false}
                                  target="_blank"
                                  rel="noopener"
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
