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

interface PairContent {
  content_id: string
  title: string
  collected_at: string
}

interface EdgeTooltip {
  forCenterId: string   // 어느 중심일 때의 툴팁인지 (centerId 바뀌면 무효화)
  neighborId: string
  neighborName: string
  contents: PairContent[]
  loading: boolean
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
}

// ─── 색상 (canvas는 CSS 변수 불가 → hex) ──────────────────────────────────────

const TYPE_COLOR: Record<EntityType, string> = {
  company:  '#E6007E',
  tech:     '#3B82F6',
  product:  '#8B5CF6',
  person:   '#10B981',
  policy:   '#F59E0B',
  industry: '#9CA3AF',
}

const COMPETITOR_COLOR = '#EF4444'
const LINK_COLOR       = 'rgba(150,150,150,0.35)'
const LINK_COLOR_HI    = 'rgba(99,102,241,0.7)'

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

// 최근성 가중치로 weight 범위가 커질 수 있어 로그 스케일로 두께 정규화
function linkWidthFromWeight(weight: number): number {
  return Math.max(0.5, Math.min(5, Math.log2(weight + 1) * 0.9))
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

  // 엣지 호버 툴팁 (forCenterId !== centerId이면 무효 = 렌더에서 null 처리)
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltip | null>(null)
  const activeTooltip = edgeTooltip?.forCenterId === centerId ? edgeTooltip : null
  const pairCacheRef = useRef<Map<string, PairContent[]>>(new Map())
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredLinkRef = useRef<string | null>(null)

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

  const centerEntity = centerId
    ? (entities.find((e) => e.id === centerId) ?? null)
    : null

  // 중심 바뀌면 캐시 초기화 (툴팁은 forCenterId 비교로 자동 무효화)
  useEffect(() => {
    pairCacheRef.current.clear()
    hoveredLinkRef.current = null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId])

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

  // 엣지 호버 핸들러 (디바운스 200ms + 캐시)
  const handleLinkHover = useCallback((
    link: { source?: unknown; target?: unknown } | null,
    _prevLink: { source?: unknown; target?: unknown } | null,
  ) => {
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current)

    if (!link || !centerId) {
      hoveredLinkRef.current = null
      hoverDebounceRef.current = setTimeout(() => {
        setEdgeTooltip((prev) => prev && prev.forCenterId !== centerId ? null : prev?.neighborId === hoveredLinkRef.current ? prev : null)
      }, 80)
      return
    }

    const srcId = String(typeof link.source === 'object' && link.source !== null
      ? (link.source as { id?: string }).id : link.source)
    const tgtId = String(typeof link.target === 'object' && link.target !== null
      ? (link.target as { id?: string }).id : link.target)
    const neighborId = srcId === centerId ? tgtId : srcId
    if (neighborId === centerId) return
    if (hoveredLinkRef.current === neighborId) return
    hoveredLinkRef.current = neighborId

    const neighbor = graphState.nodes.find((n) => n.id === neighborId)
    const neighborName = neighbor?.label ?? ''
    const currentCenterId = centerId

    const cached = pairCacheRef.current.get(neighborId)
    if (cached) {
      setEdgeTooltip({ forCenterId: currentCenterId, neighborId, neighborName, contents: cached, loading: false })
      return
    }

    setEdgeTooltip({ forCenterId: currentCenterId, neighborId, neighborName, contents: [], loading: true })

    hoverDebounceRef.current = setTimeout(() => {
      if (hoveredLinkRef.current !== neighborId) return
      const supabase = createClient()
      supabase
        .rpc('entity_pair_contents', { p_a: currentCenterId, p_b: neighborId, p_limit: 5 })
        .then(({ data }) => {
          if (hoveredLinkRef.current !== neighborId) return
          const rows = (data ?? []) as PairContent[]
          pairCacheRef.current.set(neighborId, rows)
          setEdgeTooltip({ forCenterId: currentCenterId, neighborId, neighborName, contents: rows, loading: false })
        })
    }, 200)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId, graphState.nodes])

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

  const handleBackgroundClick = useCallback(() => {
    hoveredLinkRef.current = null
    setEdgeTooltip(null)
  }, [])

  const toggleType = (type: EntityType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const selectCenter = (id: string) => {
    if (centerId) setHistory((prev) => [...prev, centerId])
    setCenterId(id)
    setSearchQuery('')
    setShowSearchDrop(false)
  }

  // 검색 필터
  const searchResults = searchQuery.trim()
    ? entities.filter((e) =>
        e.canonical_name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ).slice(0, 8)
    : []

  // 프리셋: 경쟁사 + mention 상위(비경쟁사) 합쳐 최대 8개
  const competitors = entities.filter((e) => e.is_competitor).slice(0, 5)
  const topNonCompetitors = entities.filter((e) => !e.is_competitor).slice(0, 3)
  const presets = [...competitors, ...topNonCompetitors]

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

      {/* 경쟁사·상위 프리셋 */}
      {presets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted-foreground">빠른 중심:</span>
          {presets.map((e) => (
            <button
              key={e.id}
              onClick={() => selectCenter(e.id)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                centerId === e.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/50 hover:bg-muted/50'
              )}
            >
              {e.is_competitor && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
              {e.canonical_name}
            </button>
          ))}
        </div>
      )}

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
            <p className="text-xs">수희가 117-graph-enrich.sql을 적용한 후 표시됩니다.</p>
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
            nodeLabel=""
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
            linkColor={(link) => {
              const raw = link as { source?: unknown; target?: unknown }
              const tgtId = String(typeof raw.target === 'object' && raw.target !== null
                ? (raw.target as { id?: string }).id : raw.target)
              const srcId = String(typeof raw.source === 'object' && raw.source !== null
                ? (raw.source as { id?: string }).id : raw.source)
              const neighborId = srcId === centerId ? tgtId : srcId
              return activeTooltip?.neighborId === neighborId ? LINK_COLOR_HI : LINK_COLOR
            }}
            linkWidth={(link) => {
              const raw = link as { weight?: number; source?: unknown; target?: unknown }
              const base = linkWidthFromWeight(raw.weight ?? 1)
              const tgtId = String(typeof raw.target === 'object' && raw.target !== null
                ? (raw.target as { id?: string }).id : raw.target)
              const srcId = String(typeof raw.source === 'object' && raw.source !== null
                ? (raw.source as { id?: string }).id : raw.source)
              const neighborId = srcId === centerId ? tgtId : srcId
              return activeTooltip?.neighborId === neighborId ? base + 1.5 : base
            }}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onLinkHover={handleLinkHover}
            cooldownTicks={80}
            enableZoomInteraction
            enablePanInteraction
          />
        )}

        {/* 안내 힌트 */}
        {!isLoading && !graphState.rpcError && visibleNodes.length > 0 && (
          <div className="absolute bottom-3 left-3 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            노드 클릭 → 재중심 · 엣지 호버 → 공동 기사
          </div>
        )}

        {/* 엣지 호버 툴팁 */}
        {activeTooltip && (
          <div
            className="pointer-events-none absolute z-20 w-64 rounded-xl border bg-background shadow-lg"
            style={{ bottom: 48, right: 12 }}
          >
            <div className="border-b px-3 py-2">
              <p className="text-xs font-semibold text-foreground">
                {centerEntity?.canonical_name} · {activeTooltip.neighborName}
              </p>
              {!activeTooltip.loading && (
                <p className="text-xs text-muted-foreground">
                  함께 등장 {activeTooltip.contents.length}건
                </p>
              )}
            </div>
            <div className="px-3 py-2">
              {activeTooltip.loading ? (
                <p className="text-xs text-muted-foreground">기사 로딩 중…</p>
              ) : activeTooltip.contents.length === 0 ? (
                <p className="text-xs text-muted-foreground">공동 기사 없음 (RPC 미적용 또는 데이터 없음)</p>
              ) : (
                <ul className="space-y-1.5">
                  {activeTooltip.contents.slice(0, 3).map((c) => (
                    <li key={c.content_id}>
                      <Link
                        href={`/dashboard/contents/${c.content_id}`}
                        className="pointer-events-auto block text-xs leading-tight text-foreground hover:text-brand-600 hover:underline"
                      >
                        {c.title}
                      </Link>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.collected_at).toLocaleDateString('ko-KR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
