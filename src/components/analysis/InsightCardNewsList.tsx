'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Quote, ChevronDown, ChevronUp, Clock, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import type { ContentMetaRecord, InsightGroup } from './InsightCardsSectionClient'
import {
  computeImportance,
  buildSelectionReason,
  computeRelatedKeywords,
  getCardDetailHref,
  IMPORTANCE_LABEL,
  IMPORTANCE_CLS,
  RELEVANCE_LABEL,
  RELEVANCE_CLS,
} from '@/lib/insight/card-meta'
import {
  BUCKET_CHIP_CLS,
  BUCKET_ACCENT_CLS,
  type TagBucket,
} from '@/lib/tag-buckets'

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

function freshnessLabel(generatedAt: string | null): { label: string; stale: boolean } | null {
  if (!generatedAt) return null
  const days = Math.floor((Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return { label: '오늘', stale: false }
  if (days === 1) return { label: '어제', stale: false }
  return { label: `${days}일 전`, stale: days >= 14 }
}

// ─── 카드뉴스 단일 카드 ────────────────────────────────────────────────────────

interface CardNewsItemProps {
  card: InsightCard
  matched: boolean
  hasPersonalization: boolean
  contentMap: Record<string, ContentMetaRecord>
  bucketByTopic?: Record<string, TagBucket>
}

function CardNewsItem({ card, matched, hasPersonalization, contentMap, bucketByTopic }: CardNewsItemProps) {
  const [expanded, setExpanded] = useState(false)
  const citations = card.citations as InsightCardCitation[]
  const firstCitation = citations[0]
  const restCitations = citations.slice(1)
  const hasExtra = restCitations.length > 0 || card.source_content_ids.length > 0
  const extraCount = restCitations.length > 0 ? restCitations.length : card.source_content_ids.length
  const expandId = `citations-${card.id}`

  const freshness = freshnessLabel(card.generated_at)
  const evidenceCount = citations.length || card.source_content_ids.length
  const importance = computeImportance(card)
  const relevance = hasPersonalization ? (matched ? 'high' as const : null) : null
  const selectionReason = buildSelectionReason({
    evidenceCount,
    matched,
    generatedAt: card.generated_at,
  })
  const relatedKeywords = computeRelatedKeywords(card, contentMap)
  const detailHref = getCardDetailHref(card)

  const bucket = bucketByTopic?.[card.topic] ?? '일반'
  const accentCls = BUCKET_ACCENT_CLS[bucket]
  const chipCls = BUCKET_CHIP_CLS[bucket]

  // 헤드라인과 분석 한 줄이 다를 때만 핵심 요약 표시
  const showLead = card.card_headline && card.card_headline !== card.headline

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-6 sm:p-8 space-y-4',
        matched ? 'border-brand-600/20' : 'border-border'
      )}
    >
      {/* 1. 상단 메타: 버킷 칩 · 기간 / 우측 내 관련도 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('shrink-0 rounded px-2 py-0.5 text-[11px] font-medium', chipCls)}>
            {card.topic}
          </span>
          <span className="text-[11px] text-muted-foreground/70 truncate">
            {formatPeriod(card.period_start, card.period_end)}
          </span>
        </div>
        {relevance === 'high' && (
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', RELEVANCE_CLS.high)}>
            {RELEVANCE_LABEL.high}
          </span>
        )}
      </div>

      {/* 2. 헤드라인 — 어그로 앵커, 좌측 버킷색 액센트 바 */}
      <div className={cn('border-l-[3px] pl-4', accentCls)}>
        <h3 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-foreground">
          <Link href={detailHref} className="hover:text-brand-600 hover:underline">
            {card.card_headline ?? card.headline}
          </Link>
        </h3>
      </div>

      {/* 3. 핵심 요약 (headline): card_headline과 다를 때만 */}
      {showLead && (
        <div className="space-y-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            핵심
          </span>
          <p className="text-[15px] text-secondary-foreground leading-relaxed line-clamp-3">
            {card.headline}
          </p>
        </div>
      )}

      {/* 4. 시사점 — clamp 해제, 충분히 */}
      {card.implication && (
        <div className="space-y-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            시사점
          </span>
          <p className="text-base text-muted-foreground leading-relaxed line-clamp-4">
            {card.implication}
          </p>
        </div>
      )}

      {/* 5. 왜 주목하나 — 맥락 문장, 은은한 좌측 보더 */}
      {selectionReason && (
        <div className={cn('border-l-2 pl-3 py-1 bg-muted/50 rounded-r', accentCls)}>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 mb-0.5">
            왜 주목하나
          </span>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {selectionReason}
          </p>
        </div>
      )}

      {/* 6. 근거 (유지) */}
      <div className="pt-3 border-t border-border space-y-2">
        {firstCitation ? (
          <div className="flex gap-2 items-start">
            <Quote className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground italic leading-snug">
                &ldquo;{firstCitation.quote}&rdquo;
              </p>
              {contentMap[firstCitation.content_id] ? (
                <Link
                  href={`/dashboard/contents/${firstCitation.content_id}`}
                  className="mt-0.5 block text-[11px] text-brand-600 hover:underline truncate"
                >
                  {contentMap[firstCitation.content_id].title}
                </Link>
              ) : (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/60 truncate">
                  출처 비공개
                </span>
              )}
            </div>
          </div>
        ) : card.source_content_ids[0] && contentMap[card.source_content_ids[0]] ? (
          <Link
            href={`/dashboard/contents/${card.source_content_ids[0]}`}
            className="block text-[11px] text-brand-600 hover:underline truncate"
          >
            {contentMap[card.source_content_ids[0]].title}
          </Link>
        ) : null}

        {hasExtra && (
          <div className="flex items-center">
            <button
              onClick={() => setExpanded(prev => !prev)}
              aria-expanded={expanded}
              aria-controls={expandId}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="h-3 w-3" />접기</>
              ) : (
                <><ChevronDown className="h-3 w-3" />근거 {extraCount}건 더 보기</>
              )}
            </button>
          </div>
        )}

        {expanded && (
          <div id={expandId} className="space-y-2 pt-1">
            {restCitations.map((c, i) => {
              const meta = contentMap[c.content_id]
              return (
                <div key={i} className="flex gap-2 items-start">
                  <Quote className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40" />
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
                </div>
              )
            })}
            {restCitations.length === 0 && card.source_content_ids.slice(1, 6).map((id) => {
              const meta = contentMap[id]
              return meta ? (
                <Link
                  key={id}
                  href={`/dashboard/contents/${id}`}
                  className="block text-[11px] text-brand-600 hover:underline truncate"
                >
                  {meta.title}
                </Link>
              ) : null
            })}
          </div>
        )}
      </div>

      {/* 7. 푸터 메타 — 중요도·신선도·근거 한 줄 */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className={cn('inline-flex items-center rounded-full border border-border/0 px-2 py-0.5 text-[10px] font-medium', IMPORTANCE_CLS[importance])}>
          {IMPORTANCE_LABEL[importance]}
        </span>
        {freshness && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            freshness.stale
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-border bg-muted text-muted-foreground'
          )}>
            <Clock className="h-2.5 w-2.5" />
            {freshness.label}
          </span>
        )}
        {evidenceCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <FileText className="h-2.5 w-2.5" />
            근거 {evidenceCount}건
          </span>
        )}
      </div>

      {/* 8. 관련 키워드 (근거 콘텐츠 기반, 토픽 제외) */}
      {relatedKeywords.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] text-muted-foreground/60">관련 키워드:</span>
          {relatedKeywords.map((kw) => (
            <Link
              key={kw}
              href={`/dashboard/topics/${encodeURIComponent(kw)}`}
              className="rounded px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground hover:text-foreground"
            >
              {kw}
            </Link>
          ))}
        </div>
      )}
    </article>
  )
}

// ─── 카드뉴스 목록 ──────────────────────────────────────────────────────────────

interface VisibleGroup extends InsightGroup {
  displayedCards: { card: InsightCard; score: number; matched: boolean }[]
  isLatest: boolean
}

interface Props {
  visibleGroups: VisibleGroup[]
  contentMap: Record<string, ContentMetaRecord>
  activeLens: string
  hasSetting: boolean
  hasPersonalization: boolean
  totalCount: number
  onResetLens: () => void
  bucketByTopic?: Record<string, TagBucket>
  /** 그룹을 박스 컨테이너(242 경쟁사 최근 뉴스 양식)로 감쌈(243). 기본 false(기존 렌더 불변) */
  boxed?: boolean
}

export default function InsightCardNewsList({
  visibleGroups,
  contentMap,
  activeLens,
  hasSetting,
  hasPersonalization,
  totalCount,
  onResetLens,
  bucketByTopic,
  boxed = false,
}: Props) {
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
              onClick={onResetLens}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              전체 보기로 전환
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {activeLens !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-600">
            {activeLens === 'mine' ? '내 업무' : '내 관심사'} · {totalCount}건
          </span>
          <button
            type="button"
            onClick={onResetLens}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            전체 보기 →
          </button>
        </div>
      )}

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
            <div className="mb-4 flex items-center gap-3">
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

          <div className={cn('space-y-4', boxed && 'p-4 sm:p-5')}>
            {displayedCards.map(({ card, matched }) => (
              <CardNewsItem
                key={card.id}
                card={card}
                matched={matched}
                hasPersonalization={hasPersonalization}
                contentMap={contentMap}
                bucketByTopic={bucketByTopic}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
