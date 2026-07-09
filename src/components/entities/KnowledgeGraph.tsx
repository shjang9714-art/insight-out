'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { RotateCcw, Search, Undo2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  type LensTarget,
  type LensKey,
  type LensContext,
} from '@/lib/lens'
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
  isCenter: boolean  // root 노드
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
  forLoadedKey: string  // loadedKey 바뀌면 자동 무효화
  pairKey: string
  nameA: string
  nameB: string
  contents: PairContent[]
  loading: boolean
}

interface ExpStackEntry {
  nodeId: string
  addedNodeIds: string[]
  addedLinkKeys: string[]
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const MAX_NODES = 60

// canvas 기반 — CSS 변수 불가 → hex 예외 (AGENTS.md §1-9 참고, 이 파일 canvas 한정)
const TYPE_COLOR: Record<EntityType, string> = {
  company:  '#E6007E',
  tech:     '#3B82F6',
  product:  '#8B5CF6',
  person:   '#10B981',
  policy:   '#F59E0B',
  industry: '#9CA3AF',
}
const COMPETITOR_COLOR  = '#EF4444'
const LINK_COLOR        = 'rgba(120,120,120,0.60)'
const LINK_COLOR_HI     = 'rgba(99,102,241,0.85)'
const LENS_RING_COLOR   = '#E6007E'   // canvas 렌즈 링 (canvas hex 예외)
const SELECTED_RING_COLOR = '#6366F1' // canvas 선택 노드 링 (canvas hex 예외)

const TYPE_ENTRIES = (Object.keys(ENTITY_TYPE_LABEL) as EntityType[]).map((t) => ({
  type: t,
  label: ENTITY_TYPE_LABEL[t],
  color: TYPE_COLOR[t],
}))

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

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

function linkWidthFromWeight(weight: number): number {
  return Math.max(1.0, Math.min(5, Math.log2(weight + 1) * 0.9))
}

function mkLinkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function getLinkEndId(end: unknown): string {
  if (typeof end === 'object' && end !== null) {
    return String((end as Record<string, unknown>).id ?? '')
  }
  return String(end ?? '')
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ initialCenter, entities }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 })

  // 렌즈 (canvas 콜백은 RAF 루프에서 실행 → ref로 최신값 전달)
  const [activeLens] = useActiveLens()
  const lensCtx = useLensContext()
  const activeLensRef = useRef<LensKey>(activeLens)
  const lensCtxRef = useRef<LensContext>(lensCtx)
  useEffect(() => { activeLensRef.current = activeLens }, [activeLens])
  useEffect(() => { lensCtxRef.current = lensCtx }, [lensCtx])

  // ego 루트
  const [rootId, setRootId] = useState<string | null>(initialCenter?.id ?? null)
  const [resetKey, setResetKey] = useState(0)
  const resetKeyRef = useRef(0)

  // 그래프 데이터 상태 (init effect에서 async callback 안에서만 set)
  const [loadedKey, setLoadedKey] = useState<string>('')
  type LoadStatus = 'loaded' | 'rpc-error' | 'no-neighbors'
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loaded')
  const [nodes, setNodes] = useState<EgoNode[]>([])
  const [links, setLinks] = useState<EgoLink[]>([])
  const [expandStack, setExpandStack] = useState<ExpStackEntry[]>([])

  // 확장 로딩 / 상한 경고 (이벤트 핸들러·async에서만 set)
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null)
  const [maxNodesReachedKey, setMaxNodesReachedKey] = useState<string>('')

  // async 콜백용 refs (stale closure 방지)
  const nodesRef         = useRef<EgoNode[]>([])
  const linksRef         = useRef<EgoLink[]>([])
  const linkKeysRef      = useRef<Set<string>>(new Set())
  const nodeIdsRef       = useRef<Set<string>>(new Set())
  const expandedIdsRef   = useRef<Set<string>>(new Set())
  const expandStackRef   = useRef<ExpStackEntry[]>([])
  const loadingNodeIdRef = useRef<string | null>(null)
  const loadedKeyRef     = useRef<string>('')

  // 타입 필터
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set())

  // 검색
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDrop, setShowSearchDrop] = useState(false)

  // 엣지 툴팁 (forLoadedKey !== loadedKey이면 자동 무효화)
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltip | null>(null)
  const pairCacheRef     = useRef<Map<string, PairContent[]>>(new Map())
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveredLinkRef   = useRef<string | null>(null)

  // 선택된 노드 (클릭 → 관련 기사 패널)
  interface ContentItem { id: string; title: string; collected_at: string }
  interface ContentsState { nodeId: string; items: ContentItem[] }
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedNodeIdRef = useRef<string | null>(null)
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId }, [selectedNodeId])
  const [contentsState, setContentsState] = useState<ContentsState | null>(null)

  // 엣지 클릭 잠금 패널
  const [lockedEdge, setLockedEdge] = useState<EdgeTooltip | null>(null)

  // 파생값 (동기 setState 없이 도출)
  const expectedKey      = rootId ? `${rootId}:${resetKey}` : ''
  const isInitLoading    = expectedKey !== '' && loadedKey !== expectedKey
  const rpcError         = loadedKey === expectedKey && loadStatus === 'rpc-error'
  const initNoNeighbors  = loadedKey === expectedKey && loadStatus === 'no-neighbors'
  const activeTooltip    = edgeTooltip?.forLoadedKey === loadedKey ? edgeTooltip : null
  const activeLockedEdge = lockedEdge?.forLoadedKey === loadedKey ? lockedEdge : null
  const maxNodesReached  = maxNodesReachedKey === loadedKey && loadedKey !== ''

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

  // ── 초기/리셋 로드 (동기 setState 없음) ───────────────────────────────────

  useEffect(() => {
    if (!rootId) return

    // refs 초기화 (setState 없음 — loading overlay로 stale UI 가림)
    nodesRef.current = []
    linksRef.current = []
    linkKeysRef.current = new Set()
    nodeIdsRef.current = new Set()
    expandedIdsRef.current = new Set()
    expandStackRef.current = []
    loadingNodeIdRef.current = null
    pairCacheRef.current.clear()
    hoveredLinkRef.current = null

    const thisKey = `${rootId}:${resetKey}`
    let cancelled = false
    const supabase = createClient()

    supabase
      .rpc('entity_neighbors', { p_entity_id: rootId, p_limit: 20, p_min_weight: 1 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          loadedKeyRef.current = thisKey
          setNodes([])
          setLinks([])
          setExpandStack([])
          setLoadStatus('rpc-error')
          setLoadedKey(thisKey)
          return
        }

        const rows = (data ?? []) as { entity_id: string; weight: number }[]
        const rootEnt = entities.find((e) => e.id === rootId)
        const rootNode = rootEnt ? entityToNode(rootEnt, true) : null

        if (rows.length === 0) {
          if (rootNode) {
            nodesRef.current = [rootNode]
            nodeIdsRef.current = new Set([rootId])
          }
          const initEntry: ExpStackEntry = { nodeId: rootId, addedNodeIds: rootNode ? [rootId] : [], addedLinkKeys: [] }
          expandedIdsRef.current = new Set([rootId])
          expandStackRef.current = [initEntry]
          loadedKeyRef.current = thisKey
          setNodes(rootNode ? [rootNode] : [])
          setLinks([])
          setExpandStack([initEntry])
          setLoadStatus('no-neighbors')
          setLoadedKey(thisKey)
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
            const newNodes: EgoNode[] = rootNode ? [rootNode] : []
            const newLinks: EgoLink[] = []
            const newLinkKeys = new Set<string>()
            const addedNodeIds: string[] = rootNode ? [rootId] : []
            const addedLinkKeys: string[] = []

            if (rootNode) nodeIdsRef.current.add(rootId)

            for (const row of rows) {
              const neighbor = neighborMap.get(row.entity_id)
              if (!neighbor) continue
              newNodes.push(entityToNode(neighbor, false))
              nodeIdsRef.current.add(row.entity_id)
              addedNodeIds.push(row.entity_id)
              const lk = mkLinkKey(rootId, row.entity_id)
              if (!newLinkKeys.has(lk)) {
                newLinkKeys.add(lk)
                newLinks.push({ source: rootId, target: row.entity_id, weight: row.weight })
                addedLinkKeys.push(lk)
              }
            }

            const initEntry: ExpStackEntry = { nodeId: rootId, addedNodeIds, addedLinkKeys }
            nodesRef.current = newNodes
            linksRef.current = newLinks
            linkKeysRef.current = newLinkKeys
            expandedIdsRef.current = new Set([rootId])
            expandStackRef.current = [initEntry]
            loadedKeyRef.current = thisKey

            setNodes(newNodes)
            setLinks(newLinks)
            setExpandStack([initEntry])
            setLoadStatus('loaded')
            setLoadedKey(thisKey)
          })
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId, resetKey])

  // ── force 파라미터 조정 ────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      const fg = graphRef.current
      if (!fg) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const charge = (fg as any).d3Force?.('charge')
      if (charge?.strength) charge.strength(-280)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const link = (fg as any).d3Force?.('link')
      if (link?.distance) link.distance(80)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(fg as any).d3ReheatSimulation?.()
    }, 150)
    return () => clearTimeout(timer)
  }, [loadedKey])

  // ── 노드 확장 ──────────────────────────────────────────────────────────────

  const expandNode = useCallback(async (nodeId: string) => {
    if (expandedIdsRef.current.has(nodeId)) return
    if (loadingNodeIdRef.current) return

    if (nodesRef.current.length >= MAX_NODES) {
      setMaxNodesReachedKey(loadedKeyRef.current)
      return
    }

    const capturedResetKey = resetKeyRef.current
    loadingNodeIdRef.current = nodeId
    setLoadingNodeId(nodeId)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('entity_neighbors', {
        p_entity_id: nodeId,
        p_limit: 12,
        p_min_weight: 1,
      })

      if (resetKeyRef.current !== capturedResetKey) return
      if (error || !data) return

      const rows = (data as { entity_id: string; weight: number }[])
      const newNeighborIds = rows.map((r) => r.entity_id).filter((id) => !nodeIdsRef.current.has(id))

      if (nodesRef.current.length + newNeighborIds.length > MAX_NODES) {
        setMaxNodesReachedKey(loadedKeyRef.current)
        return
      }

      const allNeighborIds = rows.map((r) => r.entity_id)
      const { data: nData } = allNeighborIds.length > 0
        ? await supabase
            .from('entities')
            .select('id, canonical_name, entity_type, is_competitor, mention_count')
            .in('id', allNeighborIds)
        : { data: [] as EntitySummary[] }

      if (resetKeyRef.current !== capturedResetKey) return

      const neighborMap = new Map(
        ((nData ?? []) as EntitySummary[]).map((e) => [e.id, e])
      )

      const addedNodeIds: string[] = []
      const addedLinkKeys: string[] = []
      const newNodes = [...nodesRef.current]
      const newLinks = [...linksRef.current]
      const newLinkKeys = new Set(linkKeysRef.current)
      const newNodeIds = new Set(nodeIdsRef.current)

      for (const row of rows) {
        const lk = mkLinkKey(nodeId, row.entity_id)
        if (!newLinkKeys.has(lk)) {
          newLinkKeys.add(lk)
          newLinks.push({ source: nodeId, target: row.entity_id, weight: row.weight })
          addedLinkKeys.push(lk)
        } else {
          const existIdx = newLinks.findIndex(
            (l) => mkLinkKey(getLinkEndId(l.source), getLinkEndId(l.target)) === lk
          )
          if (existIdx >= 0 && row.weight > (newLinks[existIdx].weight ?? 0)) {
            newLinks[existIdx] = { ...newLinks[existIdx], weight: row.weight }
          }
        }

        if (!newNodeIds.has(row.entity_id)) {
          const neighbor = neighborMap.get(row.entity_id)
          if (neighbor) {
            newNodes.push(entityToNode(neighbor, false))
            newNodeIds.add(row.entity_id)
            addedNodeIds.push(row.entity_id)
          }
        }
      }

      const newExpandedIds = new Set(expandedIdsRef.current)
      newExpandedIds.add(nodeId)
      const newEntry: ExpStackEntry = { nodeId, addedNodeIds, addedLinkKeys }
      const newStack = [...expandStackRef.current, newEntry]

      nodesRef.current = newNodes
      linksRef.current = newLinks
      linkKeysRef.current = newLinkKeys
      nodeIdsRef.current = newNodeIds
      expandedIdsRef.current = newExpandedIds
      expandStackRef.current = newStack

      setNodes(newNodes)
      setLinks(newLinks)
      setExpandStack(newStack)
    } finally {
      if (resetKeyRef.current === capturedResetKey) {
        loadingNodeIdRef.current = null
        setLoadingNodeId(null)
      }
    }
  }, [])

  // ── 한 단계 취소 ───────────────────────────────────────────────────────────

  const handleUndo = () => {
    if (expandStackRef.current.length <= 1) return

    const last = expandStackRef.current[expandStackRef.current.length - 1]
    const newStack = expandStackRef.current.slice(0, -1)

    const removedNodeIds = new Set(last.addedNodeIds)
    const removedLinkKeys = new Set(last.addedLinkKeys)

    const newNodes = nodesRef.current.filter((n) => !removedNodeIds.has(n.id))
    const newLinks = linksRef.current.filter(
      (l) => !removedLinkKeys.has(mkLinkKey(getLinkEndId(l.source), getLinkEndId(l.target)))
    )
    const newLinkKeys = new Set([...linkKeysRef.current].filter((k) => !removedLinkKeys.has(k)))
    const newNodeIds  = new Set([...nodeIdsRef.current].filter((id) => !removedNodeIds.has(id)))
    const newExpandedIds = new Set(expandedIdsRef.current)
    newExpandedIds.delete(last.nodeId)

    nodesRef.current = newNodes
    linksRef.current = newLinks
    linkKeysRef.current = newLinkKeys
    nodeIdsRef.current = newNodeIds
    expandedIdsRef.current = newExpandedIds
    expandStackRef.current = newStack

    setNodes(newNodes)
    setLinks(newLinks)
    setExpandStack(newStack)
    setMaxNodesReachedKey('')
  }

  // ── 초기화 / 새 중심 ───────────────────────────────────────────────────────

  const handleReset = () => {
    setResetKey((k) => {
      const next = k + 1
      resetKeyRef.current = next
      return next
    })
  }

  const selectCenter = (id: string) => {
    setRootId(id)
    setResetKey((k) => {
      const next = k + 1
      resetKeyRef.current = next
      return next
    })
    setSearchQuery('')
    setShowSearchDrop(false)
  }

  // ── 노드 클릭 ──────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    const id = String(node.id)
    setSelectedNodeId((prev) => (prev === id ? null : id))
    setLockedEdge(null)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    hoveredLinkRef.current = null
    setEdgeTooltip(null)
    setLockedEdge(null)
    setSelectedNodeId(null)
  }, [])

  // ── 엣지 호버 (디바운스 200ms + 캐시) ─────────────────────────────────────

  const handleLinkHover = useCallback((
    link: { source?: unknown; target?: unknown } | null,
  ) => {
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current)

    if (!link) {
      hoveredLinkRef.current = null
      hoverDebounceRef.current = setTimeout(() => {
        setEdgeTooltip((prev) => prev?.pairKey === hoveredLinkRef.current ? prev : null)
      }, 80)
      return
    }

    const srcId = getLinkEndId(link.source)
    const tgtId = getLinkEndId(link.target)
    const pk = mkLinkKey(srcId, tgtId)

    if (hoveredLinkRef.current === pk) return
    hoveredLinkRef.current = pk

    const currentLoadedKey = loadedKeyRef.current
    const nodeA = nodesRef.current.find((n) => n.id === srcId)
    const nodeB = nodesRef.current.find((n) => n.id === tgtId)
    const nameA = nodeA?.label ?? ''
    const nameB = nodeB?.label ?? ''

    const cached = pairCacheRef.current.get(pk)
    if (cached) {
      setEdgeTooltip({ forLoadedKey: currentLoadedKey, pairKey: pk, nameA, nameB, contents: cached, loading: false })
      return
    }

    setEdgeTooltip({ forLoadedKey: currentLoadedKey, pairKey: pk, nameA, nameB, contents: [], loading: true })

    hoverDebounceRef.current = setTimeout(() => {
      if (hoveredLinkRef.current !== pk) return
      const supabase = createClient()
      supabase
        .rpc('entity_pair_contents', { p_a: srcId, p_b: tgtId, p_limit: 5 })
        .then(({ data }) => {
          if (hoveredLinkRef.current !== pk) return
          const rows = (data ?? []) as PairContent[]
          pairCacheRef.current.set(pk, rows)
          setEdgeTooltip({ forLoadedKey: currentLoadedKey, pairKey: pk, nameA, nameB, contents: rows, loading: false })
        })
    }, 200)
  }, [])

  // ── 엣지 클릭 → 잠금 패널 ────────────────────────────────────────────────

  const handleLinkClick = useCallback((link: { source?: unknown; target?: unknown }) => {
    const srcId = getLinkEndId(link.source)
    const tgtId = getLinkEndId(link.target)
    const pk = mkLinkKey(srcId, tgtId)
    const currentLoadedKey = loadedKeyRef.current
    const nodeA = nodesRef.current.find((n) => n.id === srcId)
    const nodeB = nodesRef.current.find((n) => n.id === tgtId)
    const nameA = nodeA?.label ?? ''
    const nameB = nodeB?.label ?? ''

    setSelectedNodeId(null)

    const cached = pairCacheRef.current.get(pk)
    if (cached) {
      setLockedEdge({ forLoadedKey: currentLoadedKey, pairKey: pk, nameA, nameB, contents: cached, loading: false })
      return
    }
    setLockedEdge({ forLoadedKey: currentLoadedKey, pairKey: pk, nameA, nameB, contents: [], loading: true })
    const supabase = createClient()
    supabase
      .rpc('entity_pair_contents', { p_a: srcId, p_b: tgtId, p_limit: 8 })
      .then(({ data }) => {
        const rows = (data ?? []) as PairContent[]
        pairCacheRef.current.set(pk, rows)
        setLockedEdge((prev) => prev?.pairKey === pk ? { ...prev, contents: rows, loading: false } : prev)
      })
  }, [])

  // ── 선택 노드 관련 기사 조회 ───────────────────────────────────────────────

  useEffect(() => {
    if (!selectedNodeId) return

    let cancelled = false
    const supabase = createClient()
    supabase
      .from('content_entities')
      .select('content_id, contents(id, title, collected_at)')
      .eq('entity_id', selectedNodeId)
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return
        type Row = { content_id: string; contents: ContentItem | null }
        const items = ((data ?? []) as unknown as Row[])
          .map((r) => r.contents)
          .filter((c): c is ContentItem => c !== null)
          .sort((a, b) => b.collected_at.localeCompare(a.collected_at))
        setContentsState({ nodeId: selectedNodeId, items })
      })
    return () => { cancelled = true }
  }, [selectedNodeId])

  const toggleType = (type: EntityType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // ── 파생 값 ────────────────────────────────────────────────────────────────

  const rootEnt = rootId ? (entities.find((e) => e.id === rootId) ?? null) : null

  const visibleNodes = nodes.filter((n) => !hiddenTypes.has(n.type) || n.isCenter)
  const visibleIds = new Set(visibleNodes.map((n) => n.id))
  const visibleLinks = links.filter((l) => {
    const src = getLinkEndId(l.source)
    const tgt = getLinkEndId(l.target)
    return visibleIds.has(src) && visibleIds.has(tgt)
  })

  const searchResults = searchQuery.trim()
    ? entities
        .filter((e) => e.canonical_name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .slice(0, 8)
    : []

  const competitors = entities.filter((e) => e.is_competitor).slice(0, 5)
  const topNonCompetitors = entities.filter((e) => !e.is_competitor).slice(0, 3)
  const presets = [...competitors, ...topNonCompetitors]

  const canUndo = expandStack.length > 1
  const expandCount = Math.max(0, expandStack.length - 1)
  const loadingNodeLabel = nodes.find((n) => n.id === loadingNodeId)?.label ?? '노드'

  // 선택 노드 파생값
  const selectedContents = contentsState?.nodeId === selectedNodeId ? contentsState.items : []
  const selectedContentsLoading = selectedNodeId !== null && (contentsState === null || contentsState.nodeId !== selectedNodeId)
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null
  const selectedNeighbors = selectedNodeId
    ? nodes.filter((n) => {
        if (n.id === selectedNodeId) return false
        return links.some((l) => {
          const s = getLinkEndId(l.source)
          const t = getLinkEndId(l.target)
          return (s === selectedNodeId && t === n.id) || (t === selectedNodeId && s === n.id)
        })
      })
    : []
  const isSelectedExpanded = selectedNodeId ? expandStack.some((e) => e.nodeId === selectedNodeId) : false

  // ── 빈 상태 ────────────────────────────────────────────────────────────────

  if (!rootId) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        엔티티 데이터가 없습니다. 콘텐츠 수집 후 다시 확인해 주세요.
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 검색 + 제어 버튼 */}
      <div className="mb-3 flex items-center gap-2">
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
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="마지막 확장 취소"
        >
          <Undo2 className="h-3.5 w-3.5" />
          취소
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="1홉으로 초기화"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          초기화
        </button>
      </div>

      {/* 빠른 중심 프리셋 */}
      {presets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted-foreground">빠른 중심:</span>
          {presets.map((e) => (
            <button
              key={e.id}
              onClick={() => selectCenter(e.id)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                rootId === e.id
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

      {/* 현재 중심 정보 */}
      {rootEnt && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>중심:</span>
          <span className="font-medium text-foreground">{rootEnt.canonical_name}</span>
          <span>·</span>
          <span>{ENTITY_TYPE_LABEL[rootEnt.entity_type]}</span>
          {rootEnt.is_competitor && <span className="text-red-500">· 경쟁사</span>}
          <span>· 언급 {rootEnt.mention_count.toLocaleString()}회</span>
          <Link href={`/dashboard/entities/${rootEnt.id}`} className="ml-1 text-brand-600 hover:underline">
            상세 보기 →
          </Link>
        </div>
      )}

      {/* 타입 필터 범례 + 렌즈 안내 */}
      <div className="mb-3">
        <p className="mb-3 text-xs text-muted-foreground">
          점=기업·기술·인물, 선=함께 뉴스에 등장한 관계. 점을 누르면 관련 기사가 보여요.
        </p>
        <div className="flex flex-wrap gap-2">
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
          {activeLens !== 'all' && (
            <span className="flex items-center gap-1.5 rounded-full border border-brand-600/30 bg-brand-600/10 px-3 py-1 text-xs font-medium text-brand-600">
              <span className="inline-block h-2 w-2 rounded-full border-2 border-brand-600" />
              관심 기업 표시
            </span>
          )}
        </div>
      </div>

      {/* 그래프 캔버스 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border bg-muted/20"
        style={{ height: 520 }}
      >
        {isInitLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
            이웃 엔티티 로딩 중…
          </div>
        )}

        {loadingNodeId && !isInitLoading && (
          <div className="absolute left-3 top-3 z-10 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            {loadingNodeLabel} 확장 중…
          </div>
        )}

        {maxNodesReached && (
          <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            상한({MAX_NODES}개) 도달 — 초기화 후 다른 경로 탐색
          </div>
        )}

        {rpcError && !isInitLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>관계 데이터(RPC) 미적용 상태입니다.</p>
            <p className="text-xs">수희가 117-graph-enrich.sql을 적용한 후 표시됩니다.</p>
          </div>
        )}

        {initNoNeighbors && !isInitLoading && !rpcError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            이 엔티티와 함께 등장한 다른 엔티티가 아직 없습니다 (콘텐츠 수집 누적 시 생성)
          </div>
        )}

        {!isInitLoading && !rpcError && visibleNodes.length > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={{ nodes: visibleNodes as unknown as { id: string }[], links: visibleLinks }}
            width={dimensions.width}
            height={520}
            nodeId="id"
            nodeLabel={() => '클릭 → 관련 기사 보기'}
            nodeVal={(node) => (node as unknown as EgoNode).val}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as unknown as EgoNode & { x: number; y: number }
              const radius = Math.max(4, n.val * 2.5)
              const color = nodeColor(n)
              const isExpanded = expandedIdsRef.current.has(n.id)

              ctx.save()

              if (!isExpanded) ctx.globalAlpha = 0.6

              ctx.beginPath()
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()

              if (n.isCenter) {
                ctx.globalAlpha = 1
                ctx.lineWidth = 3
                ctx.strokeStyle = '#ffffff'
                ctx.stroke()
                ctx.lineWidth = 1.5
                ctx.strokeStyle = color
                ctx.beginPath()
                ctx.arc(n.x, n.y, radius + 4, 0, 2 * Math.PI)
                ctx.stroke()
              } else if (!isExpanded) {
                ctx.setLineDash([3, 3])
                ctx.lineWidth = 1
                ctx.strokeStyle = color
                ctx.beginPath()
                ctx.arc(n.x, n.y, radius + 3, 0, 2 * Math.PI)
                ctx.stroke()
                ctx.setLineDash([])
              }

              ctx.globalAlpha = 1

              // 렌즈 링
              const lt: LensTarget = { names: [n.label], isCompetitor: n.isCompetitor, entityId: n.id }
              if (
                activeLensRef.current !== 'all' &&
                matchesLens(activeLensRef.current, lensCtxRef.current, lt)
              ) {
                ctx.lineWidth = 2
                ctx.strokeStyle = LENS_RING_COLOR
                ctx.beginPath()
                ctx.arc(n.x, n.y, radius + (n.isCenter ? 9 : 6), 0, 2 * Math.PI)
                ctx.stroke()
              }

              // 선택 노드 링
              if (n.id === selectedNodeIdRef.current) {
                ctx.globalAlpha = 1
                ctx.lineWidth = 2.5
                ctx.strokeStyle = SELECTED_RING_COLOR
                ctx.setLineDash([])
                ctx.beginPath()
                ctx.arc(n.x, n.y, radius + (n.isCenter ? 13 : 10), 0, 2 * Math.PI)
                ctx.stroke()
              }

              // 라벨
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
              const pk = mkLinkKey(getLinkEndId(raw.source), getLinkEndId(raw.target))
              return activeTooltip?.pairKey === pk ? LINK_COLOR_HI : LINK_COLOR
            }}
            linkWidth={(link) => {
              const raw = link as { weight?: number; source?: unknown; target?: unknown }
              const base = linkWidthFromWeight(raw.weight ?? 1)
              const pk = mkLinkKey(getLinkEndId(raw.source), getLinkEndId(raw.target))
              return activeTooltip?.pairKey === pk ? base + 1.5 : base
            }}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onLinkHover={handleLinkHover}
            onLinkClick={handleLinkClick}
            cooldownTicks={80}
            d3AlphaDecay={0.015}
            d3VelocityDecay={0.25}
            warmupTicks={40}
            enableZoomInteraction
            enablePanInteraction
          />
        )}

        {/* 안내 힌트 */}
        {!isInitLoading && !rpcError && visibleNodes.length > 0 && (
          <div className="absolute bottom-3 left-3 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            점 클릭 → 관련 기사 · 이웃 펼치기 버튼 → 확장 · 선 클릭 → 연결 이유
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
                {activeTooltip.nameA} · {activeTooltip.nameB}
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

      {/* 선택 노드 패널 */}
      {selectedNode && (
        <div className="mt-3 rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedNode.label}</p>
              <p className="text-xs text-muted-foreground">
                {ENTITY_TYPE_LABEL[selectedNode.type]}
                {selectedNode.isCompetitor && ' · 경쟁사'}
                {' · 언급 '}{selectedNode.mentionCount.toLocaleString()}회
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => void expandNode(selectedNode.id)}
                disabled={isSelectedExpanded || !!loadingNodeId}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loadingNodeId === selectedNode.id ? '확장 중…' : isSelectedExpanded ? '이미 펼쳐짐' : '이웃 펼치기'}
              </button>
              <Link
                href={`/dashboard/entities/${selectedNode.id}`}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                상세 보기 →
              </Link>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {selectedNeighbors.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] text-muted-foreground/70">함께 등장하는 주제</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedNeighbors.slice(0, 10).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: nodeColor(n) }} />
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] text-muted-foreground/70">관련 기사</p>
            {selectedContentsLoading ? (
              <p className="text-xs text-muted-foreground">기사 로딩 중…</p>
            ) : selectedContents.length === 0 ? (
              <p className="text-xs text-muted-foreground">관련 기사가 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectedContents.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground/60">
                      {new Date(c.collected_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <Link
                      href={`/dashboard/contents/${c.id}`}
                      className="block text-xs text-foreground/80 hover:text-brand-600 hover:underline leading-snug line-clamp-2"
                    >
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 엣지 클릭 잠금 패널 */}
      {activeLockedEdge && !selectedNode && (
        <div className="mt-3 rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {activeLockedEdge.nameA} · {activeLockedEdge.nameB}
              </p>
              {!activeLockedEdge.loading && (
                <p className="text-xs text-muted-foreground">
                  기사 {activeLockedEdge.contents.length}건에서 함께 등장
                </p>
              )}
            </div>
            <button
              onClick={() => setLockedEdge(null)}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {activeLockedEdge.loading ? (
            <p className="text-xs text-muted-foreground">기사 로딩 중…</p>
          ) : activeLockedEdge.contents.length === 0 ? (
            <p className="text-xs text-muted-foreground">공동 기사 없음 (RPC 미적용 또는 데이터 없음)</p>
          ) : (
            <ul className="space-y-1.5">
              {activeLockedEdge.contents.map((c) => (
                <li key={c.content_id} className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground/60">
                    {new Date(c.collected_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                  </span>
                  <Link
                    href={`/dashboard/contents/${c.content_id}`}
                    className="block text-xs text-foreground/80 hover:text-brand-600 hover:underline leading-snug line-clamp-2"
                  >
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-2 text-right text-xs text-muted-foreground">
        중심: {rootEnt?.canonical_name ?? '없음'} · 노드 {visibleNodes.length} · 확장 {expandCount}단계
      </p>
    </div>
  )
}
