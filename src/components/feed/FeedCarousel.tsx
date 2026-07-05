'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface FeedCarouselProps {
  children: ReactNode[]
  /** 자동 회전 사용 여부 (읽기 화면에선 끄기 권장) */
  autoplay?: boolean
  /** 자동 회전 간격(ms) */
  intervalMs?: number
  /** 카드 하나의 고정 너비(px) */
  cardWidth?: number
  /** 카드 하나의 고정 높이(px) — 지정 시 카드 높이 통일. 미지정 시 내용에 맞춤 */
  cardHeight?: number
}

const GAP = 16 // gap-4

/**
 * 가로 스냅 스크롤 + 자동 회전 캐러셀.
 * - 일정 간격마다 한 카드씩 우측으로 이동, 끝에 닿으면 처음으로 순환
 * - hover/focus/터치 중에는 자동 회전 일시정지
 * - 좌우 화살표로 수동 이동
 */
export default function FeedCarousel({
  children,
  autoplay = true,
  intervalMs = 3800,
  cardWidth = 288,
  cardHeight,
}: FeedCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)
  const step = cardWidth + GAP

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  const scrollByStep = useCallback(
    (dir: 1 | -1) => {
      const el = trackRef.current
      if (!el) return
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 8
      if (dir === 1 && atEnd) {
        el.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        el.scrollBy({ left: dir * step, behavior: 'smooth' })
      }
    },
    [step]
  )

  // 자동 회전
  useEffect(() => {
    if (!autoplay || paused || children.length <= 1) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const timer = setInterval(() => scrollByStep(1), intervalMs)
    return () => clearInterval(timer)
  }, [autoplay, paused, children.length, intervalMs, scrollByStep])

  useEffect(() => {
    updateArrows()
  }, [updateArrows, children.length])

  return (
    <div
      className="group/carousel relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div
            key={i}
            className="shrink-0 snap-start"
            style={{ width: cardWidth, height: cardHeight }}
            // cardHeight 미지정 시 height: undefined → 내용 높이에 맞춤
          >
            {child}
          </div>
        ))}
      </div>

      {/* 좌우 화살표 — hover 시 노출 (데스크톱) */}
      {canLeft && (
        <button
          type="button"
          aria-label="이전"
          onClick={() => scrollByStep(-1)}
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur transition-opacity opacity-0 group-hover/carousel:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="다음"
          onClick={() => scrollByStep(1)}
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur transition-opacity opacity-0 group-hover/carousel:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronRight className="h-4 w-4 text-foreground" />
        </button>
      )}
    </div>
  )
}
