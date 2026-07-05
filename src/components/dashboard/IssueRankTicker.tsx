'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export interface TickerIssue {
  id: string
  title: string
  recentCount: number
  changePct: number | null
  changeFlag: 'surge' | 'worsening' | null
  sentimentPos: number
  sentimentNeg: number
}

interface IssueRankTickerProps {
  issues: TickerIssue[]
  /** 한 번에 보이는 행 수 */
  visibleRows?: number
  /** 한 행이 지나가는 시간(ms) — 스크롤 속도 */
  msPerRow?: number
}

const ROW_H = 44 // px, h-11

function ChangeBadge({ issue }: { issue: TickerIssue }) {
  if (issue.changeFlag === 'worsening') {
    return (
      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        ⚠ 악화
      </span>
    )
  }
  if (issue.changeFlag === 'surge') {
    return (
      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
        {issue.changePct === null ? '신규' : '급상승'}
      </span>
    )
  }
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {issue.changePct === null ? '-' : issue.changePct > 0 ? `+${issue.changePct}%` : `${issue.changePct}%`}
    </span>
  )
}

function Row({ issue, rank }: { issue: TickerIssue; rank: number }) {
  const sentimentTotal = issue.sentimentPos + issue.sentimentNeg
  return (
    <Link
      href={`/dashboard/issues/${issue.id}`}
      className="group flex h-11 items-center gap-3 rounded-xl border border-transparent px-3 transition-colors hover:border-border hover:bg-accent/50"
    >
      {/* 순위 번호 */}
      <span
        className={`shrink-0 w-5 text-center text-sm font-bold tabular-nums ${
          rank <= 3 ? 'text-brand-600' : 'text-muted-foreground'
        }`}
      >
        {rank}
      </span>

      {/* 변화 감지 배지 */}
      <ChangeBadge issue={issue} />

      {/* 제목 */}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-brand-600 transition-colors">
        {issue.title}
      </span>

      {/* 최근 7일 + 논조 */}
      <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{issue.recentCount}건</span>
        {sentimentTotal > 0 && (
          <div className="flex items-center gap-1">
            {issue.sentimentPos > 0 && (
              <span className="rounded px-1 py-0.5 bg-positive-soft text-positive">
                긍{issue.sentimentPos}
              </span>
            )}
            {issue.sentimentNeg > 0 && (
              <span className="rounded px-1 py-0.5 bg-negative-soft text-negative">
                부{issue.sentimentNeg}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function IssueRankTicker({
  issues,
  visibleRows = 5,
  msPerRow = 2200,
}: IssueRankTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<Animation | null>(null)

  // 마운트 후에만 스크롤 활성화(SSR/하이드레이션 불일치 방지). 풀이 창보다 크고 모션 허용일 때만.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 1회성 마운트 플래그(허용 패턴)
  useEffect(() => setMounted(true), [])

  const reduceMotion =
    mounted &&
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const scroll = mounted && !reduceMotion && issues.length > visibleRows

  // Web Animations API로 무한 세로 스크롤 (리스트 2벌 복제 → -50% 이동으로 이음매 없음)
  useEffect(() => {
    if (!scroll) return
    const el = trackRef.current
    if (!el) return
    const anim = el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }],
      { duration: issues.length * msPerRow, iterations: Infinity, easing: 'linear' }
    )
    animRef.current = anim
    return () => anim.cancel()
  }, [scroll, issues.length, msPerRow])

  const pause = () => animRef.current?.pause()
  const resume = () => animRef.current?.play()

  // 폴백: 스크롤 불필요 → 정적 리스트
  if (!scroll) {
    return (
      <div className="flex flex-col gap-1">
        {issues.map((issue, i) => (
          <Row key={issue.id} issue={issue} rank={i + 1} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: visibleRows * ROW_H }}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
    >
      <div ref={trackRef} className="flex flex-col">
        {[...issues, ...issues].map((issue, i) => (
          <Row key={`${issue.id}-${i}`} issue={issue} rank={(i % issues.length) + 1} />
        ))}
      </div>
      {/* 위/아래 페이드 마스크 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-card to-transparent" />
    </div>
  )
}
