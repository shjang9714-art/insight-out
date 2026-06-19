'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import type { ForceGraphMethods } from 'react-force-graph-2d'

// canvas 기반 — SSR 금지
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface EntitySummary {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  mention_count: number
}

interface EgoNode {
  id: string
  label: string
  type: EntityType
  val: number
  isCompetitor: boolean
  mentionCount: number
  isCenter: boolean
}

interface EgoLink {
  source: string
  target: string
  weight: number
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
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
const LINK_COLOR = 'rgba(150,150,150,0.4)'

const TYPE_ENTRIES = (Object.keys(ENTITY_TYPE_LABEL) as EntityType[]).map((t) => ({
  type: t,
  label: ENTITY_TYPE_LABEL[t],
  color: TYPE_COLOR[t],
}))

function nodeColor(node: EgoNode): string {
  if (node.type === 'company' && node.isCompetitor) return COMPETITOR_COLOR
  return TYPE_COLOR[node.type] ?? '#9CA3AF'
}

function entityToNode(e: EntitySummary, isCenter: boolean): EgoNode {
  return {
    id: e.id,
    label: e.canonical_name,
    type: e.entity_type,
    val: isCenter
      ? Math.max(4, Math.min(16, Math.sqrt(e.mention_count) * 2))
      : Math.max(2, Math.min(10, Math.sqrt(e.mention_count) * 1.2)),
    isCompetitor: e.is_competitor,
    mentionCount: e.mention_count,
    isCenter,
  }
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ initialCenter, entities }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 })

  // ego 상태
  const [centerId, setCenterId] = useState<string | null>(initialCenter?.id ?? null)
  const [history, setHistory] = useState<string[]>([])
  // forId = 현재 graphState가 어느 center에 대한 데이터인지 (centerId와 다르면 로딩 중)
  const [graphState, setGraphState] = useState<{
    forId: string | null
    nodes: EgoNode[]
    links: EgoLink[]
    noNeighbors: boolean
    rpcError: boolean
  }>({ forId: null, nodes: [], links: [], noNeighbors: false, rpcError: false })

  const isLoading = centerId !== null && centerId !== graphState.forId && !graphState.rpcError

  // 타입 필터
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set())

  // 검색
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDrop, setShowSearchDrop] = useState(false)

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setDimensions({ width: el.offsetWidth, height: 520 })
    })
    ro.observe(el)
    setDimensions({ width: el.offsetWidth, height: 520 })
    return () => ro.disconnect()
  }, [])

  // 중심 엔티티 메타
  const centerEntity = centerId
    ? (entities.find((e) => e.id === centerId) ?? null)
    : null

  // 이웃 로드 (동기 setState 없음 — React Compiler 호환)
  useEffect(() => {
    if (!centerId) return
    let cancelled = false
    const supabase = createClient()
    const loadingFor = centerId

    supabase
      .rpc('entity_neighbors', { p_entity_id: loadingFor, p_limit: 20, p_min_weight: 1 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setGraphState({ forId: loadingFor, nodes: [], links: [], noNeighbors: false, rpcError: true })
          return
        }

        const rows = (data ?? []) as { entity_id: string; weight: number }[]
        if (rows.length === 0) {
          const center = entities.find((e) => e.id === loadingFor)
          setGraphState({
            forId: loadingFor,
            nodes: center ? [entityToNode(center, true)] : [],
            links: [],
            noNeighbors: true,
            rpcError: false,
          })
          return
        }

        const neighborIds = rows.map((r) => r.entity_id)
        supabase
          .from('entities')
          .select('id, canonical_name, entity_type, is_competitor, mention_count')
          .in('id', neighborIds)
          .then(({ data: nData }) => {
            if (cancelled) return
            const neighborMap = new Map(
              ((nData ?? []) as EntitySummary[]).map((e) => [e.id, e])
            )
            const centerEnt = entities.find((e) => e.id === loadingFor)
            const nodes: EgoNode[] = centerEnt ? [entityToNode(centerEnt, true)] : []
            const links: EgoLink[] = []
            for (const row of rows) {
              const neighbor = neighborMap.get(row.entity_id)
              if (!neighbor) continue
              nodes.push(entityToNode(neighbor, false))
              links.push({ source: loadingFor, target: row.entity_id, weight: row.weight })
            }
            setGraphState({ forId: loadingFor, nodes, links, noNeighbors: false, rpcError: false })
          })
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId])

  // 필터 적용
  const visibleNodes = graphState.nodes.filter((n) => !hiddenTypes.has(n.type) || n.isCenter)
  const visibleIds = new Set(visibleNodes.map((n) => n.id))
  const visibleLinks = graphState.links.filter(
    (l) => visibleIds.has(String(l.source)) && visibleIds.has(String(l.target))
  )

  // 노드 클릭 — 이웃 → 재중심
  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    const id = String(node.id)
    if (id === centerId) return
    setHistory((prev) => centerId ? [...prev, centerId] : prev)
    setCenterId(id)
  }, [centerId])

  const handleBackClick = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setCenterId(prev)
  }

  const handleBackgroundClick = useCallback(() => {}, [])

  const toggleType = (type: EntityType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // 검색 필터
  const searchResults = searchQuery.trim()
    ? entities.filter((e) =>
        e.canonical_name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ).slice(0, 8)
    : []

  const selectCenter = (id: string) => {
    if (centerId) setHistory((prev) => [...prev, centerId])
    setCenterId(id)
    setSearchQuery('')
    setShowSearchDrop(false)
  }

  if (!centerId && !initialCenter) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        엔티티 데이터가 없습니다. 콘텐츠 수집 후 다시 확인해 주세요.
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 검색 + 뒤로 가기 */}
      <div className="mb-3 flex items-center gap-2">
        {history.length > 0 && (
          <button
            onClick={handleBackClick}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전
          </button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="엔티티 검색해 중심으로 설정…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearchDrop(true) }}
            onFocus={() => setShowSearchDrop(true)}
            onBlur={() => setTimeout(() => setShowSearchDrop(false), 150)}
            className="w-full rounded-lg border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-brand-600"
          />
          {showSearchDrop && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border bg-background shadow-lg">
              {searchResults.map((e) => (
                <button
                  key={e.id}
                  onMouseDown={() => selectCenter(e.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: e.is_competitor && e.entity_type === 'company' ? COMPETITOR_COLOR : TYPE_COLOR[e.entity_type] }}
                  />
                  <span className="truncate">{e.canonical_name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {ENTITY_TYPE_LABEL[e.entity_type]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 현재 중심 표시 */}
      {centerEntity && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>중심:</span>
          <span className="font-medium text-foreground">{centerEntity.canonical_name}</span>
          <span>·</span>
          <span>{ENTITY_TYPE_LABEL[centerEntity.entity_type]}</span>
          {centerEntity.is_competitor && <span className="text-red-500">· 경쟁사</span>}
          <span>· 언급 {centerEntity.mention_count.toLocaleString()}회</span>
          <Link
            href={`/dashboard/entities/${centerEntity.id}`}
            className="ml-1 text-brand-600 hover:underline"
          >
            상세 보기 →
          </Link>
        </div>
      )}

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
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
        <button className="flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium opacity-70">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          경쟁사
        </button>
      </div>

      {/* 그래프 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border bg-muted/20"
        style={{ height: 520 }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
            이웃 엔티티 로딩 중…
          </div>
        )}

        {graphState.rpcError && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>관계 데이터(RPC) 미적용 상태입니다.</p>
            <p className="text-xs">수희가 116-entity-neighbors.sql을 적용한 후 표시됩니다.</p>
          </div>
        )}

        {graphState.noNeighbors && !isLoading && !graphState.rpcError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            이 엔티티와 함께 등장한 다른 엔티티가 아직 없습니다 (콘텐츠 수집 누적 시 생성)
          </div>
        )}

        {!isLoading && !graphState.rpcError && visibleNodes.length > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={{ nodes: visibleNodes as unknown as { id: string }[], links: visibleLinks }}
            width={dimensions.width}
            height={520}
            nodeId="id"
            nodeLabel="label"
            nodeVal={(node) => (node as unknown as EgoNode).val}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as unknown as EgoNode & { x: number; y: number }
              const radius = Math.max(4, n.val * 2.5)
              const color = nodeColor(n)
              ctx.save()
              ctx.beginPath()
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
              if (n.isCenter) {
                ctx.lineWidth = 3
                ctx.strokeStyle = '#ffffff'
                ctx.stroke()
                ctx.lineWidth = 1.5
                ctx.strokeStyle = color
                ctx.beginPath()
                ctx.arc(n.x, n.y, radius + 4, 0, 2 * Math.PI)
                ctx.stroke()
              }
              const fontSize = Math.max(8, 12 / globalScale)
              ctx.font = `${n.isCenter ? 'bold ' : ''}${fontSize}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = '#374151'
              ctx.fillText(n.label, n.x, n.y + radius + 2)
              ctx.restore()
            }}
            nodeCanvasObjectMode={() => 'replace'}
            linkColor={() => LINK_COLOR}
            linkWidth={(link) => {
              const raw = link as { weight?: number }
              return Math.max(0.5, Math.min(4, (raw.weight ?? 1) * 0.4))
            }}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            cooldownTicks={80}
            enableZoomInteraction
            enablePanInteraction
          />
        )}

        {/* 우측 하단: 닫기 버튼 없는 미니 안내 */}
        {!isLoading && !graphState.rpcError && visibleNodes.length > 0 && (
          <div className="absolute bottom-3 left-3 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            이웃 노드 클릭 → 재중심 탐색
          </div>
        )}
      </div>

      <p className="mt-2 text-right text-xs text-muted-foreground">
        노드 {visibleNodes.length} · 엣지 {visibleLinks.length}
        {history.length > 0 && ` · 히스토리 ${history.length}단계`}
      </p>
    </div>
  )
}
