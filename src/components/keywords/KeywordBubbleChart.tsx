'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SignalItem } from '@/components/analysis/AiInsightBoard'

interface Props {
  items: SignalItem[]
}

interface Bubble extends SignalItem {
  x: number
  y: number
  r: number
}

const MIN_R = 26
const MAX_R = 68
const PADDING = 6
// 브랜드 hue(#E6007E ≈ 327°) 하나만 쓰고 명도만 분산 — 색이 너무 많아지지 않게
const HUE = 327
const SATURATION = 62

/** 그리디 스파이럴 배치 — d3-hierarchy 없이 원 패킹을 근사 */
function packBubbles(items: SignalItem[]): Bubble[] {
  if (items.length === 0) return []
  const maxCount = Math.max(...items.map((i) => i.contentCount), 1)
  const sized = items
    .map((item) => ({
      ...item,
      r: Math.max(MIN_R, Math.round(MAX_R * Math.sqrt(Math.max(item.contentCount, 0) / maxCount))),
    }))
    .sort((a, b) => b.r - a.r)

  const placed: Bubble[] = []
  for (const item of sized) {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 })
      continue
    }
    let angle = 0
    let radius = 0
    let x = 0
    let y = 0
    const angleStep = 0.28
    const radiusStep = 1.4
    for (let step = 0; step < 8000; step++) {
      x = radius * Math.cos(angle)
      y = radius * Math.sin(angle)
      const collides = placed.some((p) => {
        const dx = p.x - x
        const dy = p.y - y
        return Math.sqrt(dx * dx + dy * dy) < p.r + item.r + PADDING
      })
      if (!collides) break
      angle += angleStep
      radius += radiusStep
    }
    placed.push({ ...item, x, y })
  }

  return placed
}

export default function KeywordBubbleChart({ items }: Props) {
  const router = useRouter()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const bubbles = packBubbles(items)

  if (bubbles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        시그널 데이터가 있는 엔티티가 없습니다.
      </div>
    )
  }

  const pad = 16
  const minX = Math.min(...bubbles.map((b) => b.x - b.r)) - pad
  const maxX = Math.max(...bubbles.map((b) => b.x + b.r)) + pad
  const minY = Math.min(...bubbles.map((b) => b.y - b.r)) - pad
  const maxY = Math.max(...bubbles.map((b) => b.y + b.r)) + pad
  const vbW = maxX - minX
  const vbH = maxY - minY

  const n = bubbles.length
  const hovered = bubbles.find((b) => b.entityId === hoveredId) ?? null

  const goToDetail = (entityId: string) => {
    router.push(`/dashboard/entities/${entityId}?origin=issues&view=keyword`)
  }

  const clearHover = (entityId: string) => {
    setHoveredId((prev) => (prev === entityId ? null : prev))
  }

  return (
    <div className="relative">
      <svg
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        className="mx-auto block w-full max-w-3xl"
        style={{ aspectRatio: `${vbW} / ${vbH}` }}
        role="list"
        aria-label="키워드 버블 차트"
      >
        {bubbles.map((b, idx) => {
          const lightness = n > 1 ? 42 + (idx / (n - 1)) * 32 : 52
          const fill = `hsl(${HUE} ${SATURATION}% ${lightness}%)`
          const fontSize = Math.max(10, Math.min(15, b.r / 4.4))
          const label = b.name.length > 8 ? `${b.name.slice(0, 7)}…` : b.name

          return (
            <g
              key={b.entityId}
              role="listitem"
              tabIndex={0}
              aria-label={`${b.name}, 콘텐츠 ${b.contentCount}건, 시그널 ${b.signalCount}건`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHoveredId(b.entityId)}
              onMouseLeave={() => clearHover(b.entityId)}
              onFocus={() => setHoveredId(b.entityId)}
              onBlur={() => clearHover(b.entityId)}
              onClick={() => goToDetail(b.entityId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  goToDetail(b.entityId)
                }
              }}
            >
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={fill}
                className="transition-opacity hover:opacity-90 focus-visible:opacity-90"
              />
              <text
                x={b.x}
                y={b.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize}
                fontWeight={600}
                pointerEvents="none"
                className={cn(lightness < 58 ? 'fill-white' : 'fill-foreground')}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{
            left: `${((hovered.x - minX) / vbW) * 100}%`,
            top: `${((hovered.y - hovered.r - minY) / vbH) * 100}%`,
          }}
        >
          <p className="font-semibold text-foreground">{hovered.name}</p>
          <p className="text-muted-foreground">
            시그널 {hovered.signalCount.toLocaleString()} · 콘텐츠 {hovered.contentCount.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}
