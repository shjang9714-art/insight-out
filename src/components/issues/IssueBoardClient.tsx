'use client'

import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  type LensTarget,
} from '@/lib/lens'
import LensSwitcher from '@/components/lens/LensSwitcher'
import type { IssueCard } from '@/lib/issues/activity'

// ─── 렌즈 배지 라벨 ────────────────────────────────────────────────────────────

function LensBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-medium text-brand-600">
      {label}
    </span>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  cards: IssueCard[]
  showLensSwitcher?: boolean
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function IssueBoardClient({ cards, showLensSwitcher = true }: Props) {
  const ctx = useLensContext()
  const [activeLens] = useActiveLens()

  const withLens = cards.map(card => {
    const target: LensTarget = { names: [card.title] }
    const score   = lensScore(activeLens, ctx, target)
    const matched = activeLens !== 'all' && matchesLens(activeLens, ctx, target)
    return { card, score, matched }
  })

  const displayed =
    activeLens === 'all'
      ? withLens
      : withLens.filter(({ matched }) => matched)

  // 렌즈 활성 시 매칭 항목 상단 정렬, 그 외 원래 순서 유지
  const sorted = activeLens !== 'all'
    ? displayed
    : [...withLens].sort((a, b) => b.score - a.score)

  return (
    <div>
      {showLensSwitcher && (
        <div className="mb-4">
          <LensSwitcher />
        </div>
      )}

      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          시장 주요 이슈를 추적합니다.
          {cards.length > 0 && ` ${cards.length}개 이슈 모니터링 중`}
        </p>
      </div>

      {sorted.length === 0 && (
        <div className="rounded-lg border border-dashed p-16 text-center text-sm text-muted-foreground">
          {activeLens === 'all'
            ? '아직 등록된 이슈가 없습니다.'
            : '현재 렌즈 조건에 해당하는 이슈가 없습니다.'}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ card, matched }) => {
            const total14Days = card.recentCount + card.prevCount
            const sentimentTotal = card.sentimentPos + card.sentimentNeg
            const lensLabel =
              activeLens === 'mine'  ? '내 관련' :
              activeLens === 'watch' ? '관심'    : null

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
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        ⚠ 논조 악화
                      </span>
                    )}
                    {card.changeFlag === 'surge' && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
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
                        <span className="rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700">
                          긍{card.sentimentPos}
                        </span>
                      )}
                      {card.sentimentNeg > 0 && (
                        <span className="rounded px-1.5 py-0.5 bg-red-50 text-red-600">
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
