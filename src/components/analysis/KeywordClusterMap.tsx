'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { KeywordItem, TagBucket } from '@/lib/tag-buckets'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

const MAX_NODES = 50
const GRAPH_HEIGHT = 460

const BUCKET_COLOR: Record<TagBucket, string> = {
  '기술·제품': '#3b82f6',
  '기업·기관': '#8b5cf6',
  '시장·산업': '#14b8a6',
  '정책·규제': '#f59e0b',
  '그 외': '#64748b',
}

const BUCKET_CENTER: Record<TagBucket, { x: number; y: number }> = {
  '기술·제품': { x: -135, y: -85 },
  '기업·기관': { x: 135, y: -85 },
  '시장·산업': { x: -135, y: 95 },
  '정책·규제': { x: 135, y: 95 },
  '그 외': { x: 0, y: 145 },
}

interface KeywordNode extends KeywordItem {
  id: string
  val: number
  radius: number
  isCenter: boolean
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphForce {
  (alpha: number): void
  initialize(nodes: KeywordNode[]): void
}

interface KeywordClusterMapProps {
  keywords: KeywordItem[]
}

function createCollisionForce(): GraphForce {
  let nodes: KeywordNode[] = []
  const force = ((alpha: number) => {
    for (let index = 0; index < nodes.length; index += 1) {
      const nodeA = nodes[index]
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const nodeB = nodes[otherIndex]
        let dx = (nodeB.x ?? 0) - (nodeA.x ?? 0)
        let dy = (nodeB.y ?? 0) - (nodeA.y ?? 0)
        if (dx === 0 && dy === 0) {
          dx = (otherIndex - index) * 0.01
          dy = 0.01
        }
        const minDistance = nodeA.radius + nodeB.radius + 9
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance >= minDistance) continue
        const movement = ((minDistance - distance) / distance) * Math.max(alpha, 0.18) * 0.55
        nodeA.vx = (nodeA.vx ?? 0) - dx * movement
        nodeA.vy = (nodeA.vy ?? 0) - dy * movement
        nodeB.vx = (nodeB.vx ?? 0) + dx * movement
        nodeB.vy = (nodeB.vy ?? 0) + dy * movement
      }
    }
  }) as GraphForce
  force.initialize = (nextNodes) => { nodes = nextNodes }
  return force
}

function createClusterForce(): GraphForce {
  let nodes: KeywordNode[] = []
  const force = ((alpha: number) => {
    for (const node of nodes) {
      const center = node.isCenter ? { x: 0, y: 0 } : BUCKET_CENTER[node.bucket]
      node.vx = (node.vx ?? 0) + (center.x - (node.x ?? 0)) * alpha * 0.08
      node.vy = (node.vy ?? 0) + (center.y - (node.y ?? 0)) * alpha * 0.08
    }
  }) as GraphForce
  force.initialize = (nextNodes) => { nodes = nextNodes }
  return force
}

function truncateLabel(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label
  let shortened = label
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}…`
}

export default function KeywordClusterMap({ keywords }: KeywordClusterMapProps) {
  const router = useRouter()
  // react-force-graph의 dynamic import가 제네릭을 보존하지 않아 인스턴스 ref만 라이브러리 기본 타입으로 받는다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const forcesAppliedRef = useRef(false)
  const fitRequestedRef = useRef(true)
  const engineRunningRef = useRef(false)
  const measuredWidthRef = useRef(0)
  const lastFittedWidthRef = useRef(0)
  const [width, setWidth] = useState(0)

  const nodes = useMemo(() => {
    const sorted = [...keywords]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko-KR'))
      .slice(0, MAX_NODES)
    const maxCount = Math.max(1, ...sorted.map((keyword) => keyword.count))
    return sorted.map((keyword, index): KeywordNode => {
      const radius = 9 + Math.sqrt(keyword.count / maxCount) * 24
      const center = index === 0 ? { x: 0, y: 0 } : BUCKET_CENTER[keyword.bucket]
      const angle = index * 2.399963
      const spread = 24 + (index % 7) * 10
      return {
        ...keyword,
        id: keyword.name,
        val: Math.max(1, keyword.count),
        radius,
        isCenter: index === 0,
        x: center.x + Math.cos(angle) * spread,
        y: center.y + Math.sin(angle) * spread,
      }
    })
  }, [keywords])
  const graphData = useMemo(() => ({ nodes, links: [] }), [nodes])
  const dataKey = nodes.map((node) => `${node.id}:${node.count}`).join('|')

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => {
      const nextWidth = element.offsetWidth
      if (nextWidth <= 0 || nextWidth === measuredWidthRef.current) return
      if (lastFittedWidthRef.current > 0) fitRequestedRef.current = true
      measuredWidthRef.current = nextWidth
      setWidth(nextWidth)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    forcesAppliedRef.current = false
    fitRequestedRef.current = true
    engineRunningRef.current = false
    lastFittedWidthRef.current = 0
  }, [dataKey])

  const configureForces = useCallback((): boolean => {
    if (forcesAppliedRef.current) return true
    const graph = graphRef.current
    if (!graph) return false
    const charge = graph.d3Force('charge')
    if (charge && 'strength' in charge && typeof charge.strength === 'function') {
      charge.strength(-45)
    }
    graph.d3Force('collide', createCollisionForce())
    graph.d3Force('cluster', createClusterForce())
    forcesAppliedRef.current = true
    graph.d3ReheatSimulation()
    return true
  }, [])

  useEffect(() => {
    if (!dataKey || width <= 0) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const ensureForces = () => {
      if (cancelled) return
      if (configureForces()) return
      attempts += 1
      if (attempts < 30) retryTimer = setTimeout(ensureForces, 50)
    }
    ensureForces()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [configureForces, dataKey, width])

  const handleEngineTick = useCallback(() => {
    engineRunningRef.current = true
    if (!forcesAppliedRef.current) configureForces()
  }, [configureForces])

  const handleEngineStop = useCallback(() => {
    engineRunningRef.current = false
    if (!fitRequestedRef.current || !forcesAppliedRef.current || measuredWidthRef.current <= 0) return
    fitRequestedRef.current = false
    lastFittedWidthRef.current = measuredWidthRef.current
    graphRef.current?.zoomToFit(450, 44)
  }, [])

  useEffect(() => {
    if (
      width <= 0 ||
      lastFittedWidthRef.current <= 0 ||
      lastFittedWidthRef.current === width ||
      !forcesAppliedRef.current ||
      engineRunningRef.current
    ) return
    const frame = requestAnimationFrame(() => {
      fitRequestedRef.current = false
      lastFittedWidthRef.current = width
      graphRef.current?.zoomToFit(250, 44)
    })
    return () => cancelAnimationFrame(frame)
  }, [width])

  if (nodes.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        표시할 키워드가 없습니다.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-muted/20"
      style={{ height: GRAPH_HEIGHT }}
      role="img"
      aria-label={`키워드 ${nodes.length}개의 유형별 버블 지도`}
    >
      {width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={width}
          height={GRAPH_HEIGHT}
          nodeId="id"
          nodeVal={(rawNode) => (rawNode as unknown as KeywordNode).val}
          nodeLabel={(rawNode) => {
            const node = rawNode as unknown as KeywordNode
            return `${node.name} · 관련 문서 ${node.count.toLocaleString()}건`
          }}
          nodeCanvasObject={(rawNode, ctx, globalScale) => {
            const node = rawNode as unknown as KeywordNode
            const x = node.x ?? 0
            const y = node.y ?? 0
            const color = BUCKET_COLOR[node.bucket]
            const hasRise = node.isNew || (node.changePct ?? 0) > 0
            ctx.save()
            ctx.beginPath()
            ctx.arc(x, y, node.radius, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.globalAlpha = node.isCenter ? 0.96 : 0.82
            ctx.fill()
            if (hasRise) {
              ctx.globalAlpha = 1
              ctx.lineWidth = node.isCenter ? 3 : 2
              ctx.strokeStyle = '#111827'
              ctx.stroke()
            }

            const showLabel = node.isCenter || node.radius >= 18 || globalScale >= 1.45
            if (showLabel) {
              const fontSize = Math.max(7, Math.min(11, node.radius / 2.7)) / Math.max(0.85, globalScale)
              ctx.globalAlpha = 1
              ctx.font = `${node.isCenter ? '700' : '600'} ${fontSize}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillStyle = '#ffffff'
              ctx.fillText(truncateLabel(ctx, node.name, node.radius * 1.55), x, y)
            }

            if (hasRise) {
              const badge = node.isNew ? 'NEW' : `▲${node.changePct}%`
              const badgeFontSize = Math.max(7, 9 / Math.max(0.8, globalScale))
              ctx.font = `700 ${badgeFontSize}px sans-serif`
              const badgeWidth = ctx.measureText(badge).width + 8
              const badgeHeight = badgeFontSize + 6
              const badgeX = x - badgeWidth / 2
              const badgeY = y - node.radius - badgeHeight / 2
              ctx.fillStyle = '#ffffff'
              ctx.strokeStyle = '#111827'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4)
              ctx.fill()
              ctx.stroke()
              ctx.fillStyle = '#111827'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(badge, x, badgeY + badgeHeight / 2)
            }
            ctx.restore()
          }}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={(rawNode, color, ctx) => {
            const node = rawNode as unknown as KeywordNode
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x ?? 0, node.y ?? 0, Math.max(14, node.radius + 5), 0, Math.PI * 2)
            ctx.fill()
          }}
          onNodeClick={(rawNode) => {
            const node = rawNode as unknown as KeywordNode
            router.push(`/dashboard/keywords/${encodeURIComponent(node.name)}`)
          }}
          onEngineTick={handleEngineTick}
          onEngineStop={handleEngineStop}
          cooldownTicks={160}
          d3AlphaDecay={0.018}
          d3VelocityDecay={0.28}
          warmupTicks={80}
          enableZoomInteraction
          enablePanInteraction
        />
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-background/85 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
        버블 크기 = 관련 문서 수 · 클릭하면 상세 보기
      </p>
      <div className="sr-only">
        {nodes.map((node) => (
          <Link
            key={node.id}
            href={`/dashboard/keywords/${encodeURIComponent(node.name)}`}
            prefetch={false}
          >
            {node.name} 상세 보기
          </Link>
        ))}
      </div>
    </div>
  )
}
