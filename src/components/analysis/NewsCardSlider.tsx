'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLensContext, useActiveLens, matchesLens, type LensTarget } from '@/lib/lens'

export interface NewsSlide {
  id: string
  type: 'insight' | 'news'
  badge: string
  topic: string | null
  headline: string
  summary: string | null
  href: string
  source: string | null
  date: string | null
  matchNames: string[]
  isCompetitor: boolean
}

interface Props {
  slides: NewsSlide[]
}

export default function NewsCardSlider({ slides }: Props) {
  const ctx = useLensContext()
  const [activeLens] = useActiveLens()
  const touchStartX = useRef<number | null>(null)

  // 렌즈 활성 시 매칭 슬라이드 먼저
  const orderedSlides = useMemo(() => {
    if (activeLens === 'all' || slides.length === 0) return slides
    const withMatch = slides.map(s => {
      const target: LensTarget = { names: s.matchNames, isCompetitor: s.isCompetitor }
      return { slide: s, matched: matchesLens(activeLens, ctx, target) }
    })
    return [
      ...withMatch.filter(s => s.matched).map(s => s.slide),
      ...withMatch.filter(s => !s.matched).map(s => s.slide),
    ]
  }, [slides, activeLens, ctx])

  // 렌즈 변경 시 인덱스 자동 리셋 — lens와 index를 쌍으로 관리
  const [indexState, setIndexState] = useState<{ lens: string; index: number }>({
    lens: activeLens,
    index: 0,
  })
  const currentIndex =
    indexState.lens === activeLens
      ? Math.min(indexState.index, Math.max(0, orderedSlides.length - 1))
      : 0

  const goTo = useCallback(
    (idxOrFn: number | ((prev: number) => number), lens: string) => {
      setIndexState(s => {
        const prev = s.lens === lens ? s.index : 0
        const next = typeof idxOrFn === 'function' ? idxOrFn(prev) : idxOrFn
        return { lens, index: next }
      })
    },
    [],
  )

  const prev = useCallback(() => {
    goTo(i => (i > 0 ? i - 1 : orderedSlides.length - 1), activeLens)
  }, [goTo, orderedSlides.length, activeLens])

  const next = useCallback(() => {
    goTo(i => (i < orderedSlides.length - 1 ? i + 1 : 0), activeLens)
  }, [goTo, orderedSlides.length, activeLens])

  // 키보드 ←/→
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next])

  if (orderedSlides.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        표시할 카드가 없습니다.
      </div>
    )
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      if (dx < 0) next()
      else prev()
    }
    touchStartX.current = null
  }

  const showNav = orderedSlides.length > 1

  return (
    <div className="relative sm:px-8">
      {/* 좌 화살표 (데스크톱) */}
      {showNav && (
        <button
          type="button"
          onClick={prev}
          aria-label="이전 카드"
          className="absolute left-0 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent transition-colors z-10"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* 슬라이드 */}
      <div
        className="overflow-hidden rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {orderedSlides.map((s) => (
            <div key={s.id} className="min-w-full">
              <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4 min-h-[200px] flex flex-col">
                {/* 키커 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    s.type === 'insight'
                      ? 'bg-brand-600/10 text-brand-600'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {s.badge}
                  </span>
                  {(s.topic ?? s.date) && (
                    <span className="text-[11px] text-muted-foreground">
                      {[s.topic, s.date].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>

                {/* 헤드라인 */}
                <h3 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-foreground">
                  {s.headline}
                </h3>

                {/* 요약 */}
                {s.summary && (
                  <p className="text-base text-muted-foreground leading-relaxed line-clamp-2">
                    {s.summary}
                  </p>
                )}

                {/* 출처 + 링크 */}
                <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {s.source ?? ''}
                  </span>
                  <Link
                    href={s.href}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {s.type === 'news' ? '기사 보기 →' : '자세히 →'}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 우 화살표 (데스크톱) */}
      {showNav && (
        <button
          type="button"
          onClick={next}
          aria-label="다음 카드"
          className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent transition-colors z-10"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* 점 인디케이터 + 카운터 + 모바일 화살표 */}
      {showNav && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={prev}
            aria-label="이전 카드"
            className="sm:hidden p-1 rounded-full border border-border hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-1.5">
            {orderedSlides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i, activeLens)}
                aria-label={`카드 ${i + 1}로 이동`}
                className={cn(
                  'rounded-full transition-all duration-200',
                  i === currentIndex
                    ? 'h-2 w-5 bg-brand-600'
                    : 'h-2 w-2 bg-border hover:bg-muted-foreground/40'
                )}
              />
            ))}
          </div>

          <span className="text-[11px] text-muted-foreground tabular-nums">
            {currentIndex + 1} / {orderedSlides.length}
          </span>

          <button
            type="button"
            onClick={next}
            aria-label="다음 카드"
            className="sm:hidden p-1 rounded-full border border-border hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  )
}
