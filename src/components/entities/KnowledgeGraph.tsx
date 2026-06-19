'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import type { ForceGraphMethods } from 'react-force-graph-2d'

// canvas 기반 — SSR 금지
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  type: EntityType
  val: number
  isCompetitor: boolean
  mentionCount: number
}

export interface GraphLink {
  source: string
  target: string
  weight: number
}

interface Props {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ─── 색상 맵 (canvas는 CSS 변수 불가 → hex 직접 정의) ─────────────────────────

const TYPE_COLOR: Record<EntityType, string> = {
  company:  '#E6007E', // brand-600
  tech:     '#3B82F6', // blue-500
  product:  '#8B5CF6', // violet-500
  person:   '#10B981', // emerald-500
  policy:   '#F59E0B', // amber-500
  industry: '#9CA3AF', // gray-400
}

const COMPETITOR_COLOR = '#EF4444' // red-500
const LINK_COLOR_DIM   = 'rgba(200,200,200,0.15)'
const LINK_COLOR_HI    = 'rgba(100,100,100,0.7)'
const NODE_DIM_OPACITY = 0.15

function nodeColor(node: GraphNode): string {
  if (node.type === 'company' && node.isCompetitor) return COMPETITOR_COLOR
  return TYPE_COLOR[node.type] ?? '#9CA3AF'
}

// ─── 범례 타입 ────────────────────────────────────────────────────────────────

const TYPE_ENTRIES = (Object.keys(ENTITY_TYPE_LABEL) as EntityType[]).map((t) => ({
  type: t,
  label: ENTITY_TYPE_LABEL[t],
  color: TYPE_COLOR[t],
}))

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ nodes, links }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set())
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setDimensions({ width: el.offsetWidth, height: 560 })
    })
    ro.observe(el)
    setDimensions({ width: el.offsetWidth, height: 560 })
    return () => ro.disconnect()
  }, [])

  const visibleNodes = nodes.filter((n) => !hiddenTypes.has(n.type))
  const visibleIds = new Set(visibleNodes.map((n) => n.id))
  const visibleLinks = links.filter(
    (l) => visibleIds.has(String(l.source)) && visibleIds.has(String(l.target))
  )

  // 선택 노드 이웃
  const neighborIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!selectedId) { neighborIds.current = new Set(); return }
    const ids = new Set<string>()
    for (const l of visibleLinks) {
      const s = String(l.source), t = String(l.target)
      if (s === selectedId) ids.add(t)
      if (t === selectedId) ids.add(s)
    }
    neighborIds.current = ids
  }, [selectedId, visibleLinks])

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null

  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    const id = String(node.id)
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  const toggleType = (type: EntityType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        아직 관계 데이터가 없습니다 (엔티티·콘텐츠 적재 필요)
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 타입 필터 범례 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TYPE_ENTRIES.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity',
              hiddenTypes.has(type) ? 'opacity-30' : 'opacity-100'
            )}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </button>
        ))}
        {/* 경쟁사 표시 */}
        <button
          onClick={() => {}}
          className="flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium opacity-70"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          경쟁사
        </button>
      </div>

      {/* 그래프 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border bg-muted/20"
        style={{ height: 560 }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-panel]')) return
        }}
      >
        <ForceGraph2D
          ref={graphRef}
          graphData={{ nodes: visibleNodes as unknown as { id: string }[], links: visibleLinks }}
          width={dimensions.width}
          height={560}
          nodeId="id"
          nodeLabel="label"
          nodeVal={(node) => (node as unknown as GraphNode).val}
          nodeColor={(node) => {
            const n = node as unknown as GraphNode
            const color = nodeColor(n)
            if (!selectedId) return color
            const id = String(n.id)
            if (id === selectedId || neighborIds.current.has(id)) return color
            return color + '26' // ~15% opacity
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as unknown as GraphNode & { x: number; y: number }
            const id = String(n.id)
            const dimmed =
              !!selectedId && id !== selectedId && !neighborIds.current.has(id)
            const radius = Math.max(4, n.val * 2.5)
            ctx.save()
            ctx.globalAlpha = dimmed ? NODE_DIM_OPACITY : 1
            ctx.beginPath()
            ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI)
            ctx.fillStyle = nodeColor(n)
            ctx.fill()
            if (id === selectedId) {
              ctx.lineWidth = 2
              ctx.strokeStyle = '#ffffff'
              ctx.stroke()
            }
            const label = n.label
            const fontSize = Math.max(8, 12 / globalScale)
            ctx.font = `${fontSize}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = dimmed ? 'rgba(100,100,100,0.4)' : '#374151'
            ctx.fillText(label, n.x, n.y + radius + 2)
            ctx.restore()
          }}
          nodeCanvasObjectMode={() => 'replace'}
          linkColor={(link) => {
            if (!selectedId) return LINK_COLOR_DIM
            // ForceGraph resolves source/target to node objects after mount
            const raw = link as { source: unknown; target: unknown; weight: number }
            const s = String(typeof raw.source === 'object' && raw.source !== null ? (raw.source as { id?: string }).id : raw.source)
            const t = String(typeof raw.target === 'object' && raw.target !== null ? (raw.target as { id?: string }).id : raw.target)
            if (s === selectedId || t === selectedId) return LINK_COLOR_HI
            return LINK_COLOR_DIM
          }}
          linkWidth={(link) => {
            const raw = link as { source: unknown; target: unknown; weight: number }
            const base = Math.max(0.5, Math.min(4, raw.weight * 0.4))
            if (!selectedId) return base
            const s = String(typeof raw.source === 'object' && raw.source !== null ? (raw.source as { id?: string }).id : raw.source)
            const t = String(typeof raw.target === 'object' && raw.target !== null ? (raw.target as { id?: string }).id : raw.target)
            if (s === selectedId || t === selectedId) return base + 1
            return 0.2
          }}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          cooldownTicks={80}
          enableZoomInteraction
          enablePanInteraction
        />

        {/* 미니 패널 */}
        {selectedNode && (
          <div
            data-panel="true"
            className="absolute bottom-4 right-4 w-56 rounded-xl border bg-background p-4 shadow-lg"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-tight">{selectedNode.label}</p>
              <button onClick={() => setSelectedId(null)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {ENTITY_TYPE_LABEL[selectedNode.type]}
              {selectedNode.isCompetitor ? ' · 경쟁사' : ''}
              &nbsp;·&nbsp;언급 {selectedNode.mentionCount.toLocaleString()}회
            </p>
            <Link
              href={`/dashboard/entities/${selectedNode.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              상세 보기 →
            </Link>
          </div>
        )}
      </div>

      <p className="mt-2 text-right text-xs text-muted-foreground">
        노드 {visibleNodes.length} · 엣지 {visibleLinks.length} · 클릭으로 관계 탐색
      </p>
    </div>
  )
}
