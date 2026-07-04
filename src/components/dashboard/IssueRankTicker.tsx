'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  /** 순번 롤링 간격(ms) */
  intervalMs?: number
}

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
        {issue.changePct === null ? '신규' : `+${issue.changePct}%`}
      </span>
    )
  }
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {issue.changePct === null ? '-' : issue.changePct > 0 ? `+${issue.changePct}%` : `${issue.changePct}%`}
    </span>
  )
}

export default function IssueRankTicker({ issues, intervalMs = 2800 }: IssueRankTickerProps) {
  // order[i] = 표시 위치 i(=순위 i+1)에 놓일 이슈의 원본 인덱스
  const [order, setOrder] = useState<number[]>(() => issues.map((_, i) => i))
  const [paused, setPaused] = useState(false)
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())
  const prevTops = useRef<Map<string, number>>(new Map())

  // prefers-reduced-motion 대응
  const reduceMotion = useRef(false)
  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [])

  // 주기적 롤링: 맨 위 항목을 맨 아래로 순환시켜 순위가 한 칸씩 상승하도록
  useEffect(() => {
    if (issues.length <= 1 || reduceMotion.current) return
    if (paused) return
    const timer = setInterval(() => {
      setOrder((prev) => {
        if (prev.length <= 1) return prev
        return [...prev.slice(1), prev[0]]
      })
    }, intervalMs)
    return () => clearInterval(timer)
  }, [issues.length, intervalMs, paused])

  // FLIP: 재정렬 후 각 행을 이전 위치에서 새 위치로 부드럽게 이동
  useLayoutEffect(() => {
    if (reduceMotion.current) return
    const raf = requestAnimationFrame(() => {
      rowRefs.current.forEach((el, id) => {
        const newTop = el.offsetTop
        const oldTop = prevTops.current.get(id)
        if (oldTop != null && oldTop !== newTop) {
          const delta = oldTop - newTop
          el.style.transition = 'none'
          el.style.transform = `translateY(${delta}px)`
          // 강제 리플로우 후 다음 프레임에 원위치로 전환
          void el.offsetHeight
          requestAnimationFrame(() => {
            el.style.transition = 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)'
            el.style.transform = ''
          })
        }
        prevTops.current.set(id, newTop)
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [order])

  return (
    <div
      className="flex flex-col gap-1"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {order.map((originalIdx, pos) => {
        const issue = issues[originalIdx]
        const rank = pos + 1
        const sentimentTotal = issue.sentimentPos + issue.sentimentNeg
        return (
          <Link
            key={issue.id}
            ref={(el) => {
              if (el) rowRefs.current.set(issue.id, el)
              else rowRefs.current.delete(issue.id)
            }}
            href={`/dashboard/issues/${issue.id}`}
            className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/50"
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
      })}
    </div>
  )
}
