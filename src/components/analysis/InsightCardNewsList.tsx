'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Quote, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardCitation } from '@/lib/types'
import type { ContentMetaRecord, InsightGroup } from './InsightCardsSectionClient'

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(new Date(start))} ~ ${fmt(new Date(end))}`
}

// ─── 카드뉴스 단일 카드 ────────────────────────────────────────────────────────

interface CardNewsItemProps {
  card: InsightCard
  matched: boolean
  contentMap: Record<string, ContentMetaRecord>
}

function CardNewsItem({ card, matched, contentMap }: CardNewsItemProps) {
  const [expanded, setExpanded] = useState(false)
  const citations = card.citations as InsightCardCitation[]
  const firstCitation = citations[0]
  const restCitations = citations.slice(1)
  const hasExtra = restCitations.length > 0 || card.source_content_ids.length > 0
  const extraCount = restCitations.length > 0 ? restCitations.length : card.source_content_ids.length
  const expandId = `citations-${card.id}`

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-6 sm:p-8 space-y-3',
        matched ? 'border-brand-600/20' : 'border-border'
      )}
    >
      {/* 키커 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {[card.topic, formatPeriod(card.period_start, card.period_end)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {matched && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-brand-600/10 text-brand-600">
            관심 표시
          </span>
        )}
      </div>

      {/* 헤드라인 */}
      <h3 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-foreground">
        {card.card_headline ?? card.headline}
      </h3>

      {/* 데크 (시사점) */}
      {card.implication && (
        <p className="text-base text-muted-foreground leading-relaxed line-clamp-2">
          {card.implication}
        </p>
      )}

      {/* 푸터 */}
      <div className="pt-3 border-t border-border space-y-2">
        {/* 대표 근거 1건 */}
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

        {/* 근거 펼치기 + 보고서 링크 */}
        <div className="flex items-center gap-3 flex-wrap">
          {hasExtra && (
            <button
              onClick={() => setExpanded(prev => !prev)}
              aria-expanded={expanded}
              aria-controls={expandId}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  접기
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  근거 {extraCount}
                </>
              )}
            </button>
          )}
          <Link
            href={`/dashboard/reports/new?type=시장동향&topic=${encodeURIComponent(card.topic ?? '')}`}
            className="text-[11px] text-muted-foreground hover:text-brand-600 transition-colors"
          >
            보고서로 만들기
          </Link>
        </div>

        {/* 펼쳐진 나머지 근거 */}
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
  totalCount: number
  onResetLens: () => void
}

export default function InsightCardNewsList({
  visibleGroups,
  contentMap,
  activeLens,
  hasSetting,
  totalCount,
  onResetLens,
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
      {/* 보기 결과 요약 */}
      {activeLens !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-600">
            {activeLens === 'mine' ? '내 담당' : '관심 기업'} · {totalCount}건
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

      {visibleGroups.map(({ key, start, end, displayedCards, isLatest }) => (
        <div key={key} className={cn(!isLatest && 'opacity-70')}>
          <div className="mb-4 flex items-center gap-3">
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

          <div className="space-y-4">
            {displayedCards.map(({ card, matched }) => (
              <CardNewsItem
                key={card.id}
                card={card}
                matched={matched}
                contentMap={contentMap}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
