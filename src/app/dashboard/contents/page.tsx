'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { getCategoryDbValues } from '@/lib/categories'
import { X, Loader2, LayoutGrid, List, Newspaper, Play, Globe, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import BookmarkButton from '@/components/bookmark/BookmarkButton'
import ArchiveButton from '@/components/archive/ArchiveButton'
import { htmlToPlainText, cleanBodyText } from '@/lib/contents/clean-body'
import PageContainer from '@/components/PageContainer'
import ContentRow from '@/components/dashboard/ContentRow'
import ContentListCard from '@/components/dashboard/ContentListCard'
import YoutubeVideoCard from '@/components/dashboard/YoutubeVideoCard'
import SourcePopover, { selectedGroups } from '@/components/dashboard/SourcePopover'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentItem {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  category: ContentCategory
  published_at: string | null
  file_path: string | null
  original_url: string | null
  is_editor_pick: boolean
  author: string | null
  sources: { name: string } | null
  matched_groups: string[]
  matched_keywords: string[]
  cluster_id: string | null
  importance_score: number
  collected_at: string
}

interface ClusterMember {
  name: string
  url: string | null
  title: string
}

interface ClusteredItem {
  item: ContentItem
  members: ClusterMember[]
}

interface ServiceOption {
  id: string
  name: string
  icon?: string | null
}

interface SourceOption {
  id: string
  name: string
  group_name: string | null
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const DATE_OPTIONS = [
  { value: 'all',   label: '전체' },
  { value: 'today', label: '오늘' },
  { value: 'week',  label: '이번 주' },
  { value: 'month', label: '이번 달' },
] as const
type DateFilter = (typeof DATE_OPTIONS)[number]['value']

type ContentView = 'card' | 'list'
const VIEW_KEY = 'io:content-view'


const PAGE_SIZE = 20

// 콘텐츠 소스타입 선택 바 (4개 고정)
const CONTENT_SOURCE_TABS = [
  { label: '뉴스',    value: '뉴스'      as ContentCategory, Icon: Newspaper, color: 'text-blue-600',   activeBg: 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-950/30 dark:border-blue-400 dark:text-blue-300',   hoverBg: 'hover:border-blue-200 hover:text-blue-700' },
  { label: '유튜브',  value: '유튜브'    as ContentCategory, Icon: Play,      color: 'text-red-600',    activeBg: 'bg-red-50 border-red-600 text-red-700 dark:bg-red-950/30 dark:border-red-400 dark:text-red-300',         hoverBg: 'hover:border-red-200 hover:text-red-700'   },
  { label: '웹인사이트', value: '웹인사이트' as ContentCategory, Icon: Globe,   color: 'text-emerald-600', activeBg: 'bg-emerald-50 border-emerald-600 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-400 dark:text-emerald-300', hoverBg: 'hover:border-emerald-200 hover:text-emerald-700' },
  { label: '리서치',  value: '리서치'    as ContentCategory, Icon: BarChart2, color: 'text-indigo-600', activeBg: 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-400 dark:text-indigo-300', hoverBg: 'hover:border-indigo-200 hover:text-indigo-700' },
] as const

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getDateStart(filter: string): string | null {
  if (filter === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (filter === 'week')  return new Date(Date.now() - 7  * 86_400_000).toISOString()
  if (filter === 'month') return new Date(Date.now() - 30 * 86_400_000).toISOString()
  return null
}

function displayDate(item: ContentItem, sortByCollected: boolean): string | null {
  if (sortByCollected || item.category === '리포트' || item.category === 'AI보고서') {
    return item.collected_at
  }
  return item.published_at ?? item.collected_at
}

function basisTime(item: ContentItem, sortByCollected: boolean): number {
  const d = sortByCollected ? item.collected_at : (item.published_at ?? item.collected_at)
  return d ? new Date(d).getTime() : 0
}

function groupByKstDay(
  clustered: ClusteredItem[],
  sortByCollected: boolean
): { key: string; label: string; items: ClusteredItem[] }[] {
  const nowKst = Date.now() + 9 * 3_600_000
  const todayKey = new Date(nowKst).toISOString().slice(0, 10)
  const yKey     = new Date(nowKst - 86_400_000).toISOString().slice(0, 10)
  const result: { key: string; label: string; items: ClusteredItem[] }[] = []
  for (const ci of clustered) {
    const raw = sortByCollected ? ci.item.collected_at : (ci.item.published_at ?? ci.item.collected_at)
    const key = new Date(new Date(raw).getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
    const last = result.at(-1)
    if (last?.key === key) {
      last.items.push(ci)
    } else {
      const label =
        key === todayKey ? '오늘' :
        key === yKey     ? '어제' :
        `${parseInt(key.slice(5, 7))}월 ${parseInt(key.slice(8))}일`
      result.push({ key, label, items: [ci] })
    }
  }
  return result
}

function getSavedView(): ContentView {
  if (typeof window === 'undefined') return 'card'
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'list' ? 'list' : 'card'
  } catch {
    return 'card'
  }
}


// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100"
        aria-label={`${label} 필터 제거`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex gap-1.5">
        <div className="h-5 w-14 rounded-md bg-muted" />
        <div className="h-5 w-20 rounded-md bg-muted" />
      </div>
      <div className="mb-2 h-5 w-full rounded bg-muted" />
      <div className="mb-1 h-5 w-4/5 rounded bg-muted" />
      <div className="mt-3 space-y-1.5">
        <div className="h-3.5 w-full rounded bg-muted" />
        <div className="h-3.5 w-5/6 rounded bg-muted" />
        <div className="h-3.5 w-2/3 rounded bg-muted" />
      </div>
      <div className="mt-4 h-3 w-1/3 rounded bg-muted" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card px-5 py-4">
      <div className="mb-2 flex gap-1.5">
        <div className="h-4 w-14 rounded-md bg-muted" />
        <div className="h-4 w-16 rounded-md bg-muted" />
      </div>
      <div className="mb-1.5 h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

function ContentsContent() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // ── URL 파라미터 ─────────────────────────────────────────────────────────────
  const category = (searchParams.get('category') ?? '') as ContentCategory | ''
  const date     = (searchParams.get('date') ?? 'all') as DateFilter
  const svcParam = searchParams.get('svc') ?? ''
  const svcIds   = useMemo(() => svcParam ? svcParam.split(',').filter(Boolean) : [], [svcParam])
  const relevant = searchParams.get('relevant') ?? '1'
  const srcParam = searchParams.get('src') ?? ''
  const srcIds   = useMemo(() => srcParam ? srcParam.split(',').filter(Boolean) : [], [srcParam])
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)))
  const sort     = (searchParams.get('sort') ?? 'published') as 'published' | 'collected'

  const isReportCategory = category === '리포트' || category === 'AI보고서'
  const sortByCollected  = sort === 'collected' || isReportCategory

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [services, setServices]   = useState<ServiceOption[]>([])
  const [sources, setSources]     = useState<SourceOption[]>([])
  const [contentView, setContentView] = useState<ContentView>('card')
  const [groupByDay, setGroupByDay]   = useState(false)
  // null = 카테고리 미선택(전체 출처 노출)
  const [scopedSourceIds, setScopedSourceIds] = useState<Set<string> | null>(null)
  const [catCounts, setCatCounts] = useState<Record<string, number>>({})

  // localStorage에서 뷰 설정 복원 (SSR 가드)
  useEffect(() => {
    startTransition(() => setContentView(getSavedView()))
  }, [])

  // 진입 시 카테고리 미지정이면 '뉴스'로 기본 설정 (URL 반영)
  useEffect(() => {
    if (!searchParams.get('category')) {
      router.replace(`${pathname}?category=뉴스`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 소스타입별 총 건수 집계 (1회)
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contents')
      .select('category')
      .eq('status', 'published')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const row of data) {
          const cat = row.category as string
          counts[cat] = (counts[cat] ?? 0) + 1
        }
        // 표시 카테고리별로 합산
        const display: Record<string, number> = {}
        display['뉴스']      = counts['뉴스'] ?? 0
        display['유튜브']    = counts['유튜브'] ?? 0
        display['웹인사이트'] = (counts['웹인사이트'] ?? 0) + (counts['오피니언'] ?? 0)
        display['리서치']    = (counts['리포트'] ?? 0) + (counts['가트너'] ?? 0) + (counts['KRG'] ?? 0)
        setCatCounts(display)
      })
  }, [])

  const handleViewChange = (v: ContentView) => {
    setContentView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* noop */ }
  }

  // ── URL 업데이트 헬퍼 ────────────────────────────────────────────────────────
  // window.location.search 를 사용해 Link 이동 직후 stale 클로저 방지
  const updateParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(window.location.search)
      if (value) p.set(key, value)
      else p.delete(key)
      if (key !== 'page') { p.delete('page'); startTransition(() => setPage(1)) }
      router.push(`${pathname}?${p.toString()}`)
    },
    [router, pathname]
  )

  // ── 서비스 목록 로드 (1회) ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('services').select('id, name, icon').order('order'),
      supabase.from('sources').select('id, name, group_name').order('name'),
    ]).then(([{ data: svcs }, { data: srcs }]) => {
      if (svcs) setServices(svcs as ServiceOption[])
      if (srcs) setSources(srcs as SourceOption[])
    })
  }, [])

  // ── 카테고리별 출처 스코프 조회 ────────────────────────────────────────────
  useEffect(() => {
    if (!category) { startTransition(() => setScopedSourceIds(null)); return }
    let cancelled = false
    const dbCats = getCategoryDbValues(category as ContentCategory)
    createClient()
      .from('contents')
      .select('source_id')
      .eq('status', 'published')
      .in('category', dbCats)
      .not('source_id', 'is', null)
      .then(({ data }) => {
        if (cancelled) return
        setScopedSourceIds(new Set((data ?? []).map((r) => r.source_id as string)))
      })
    return () => { cancelled = true }
  }, [category])

  // 카테고리 전환 시 범위 밖 출처 선택 정리 (무한루프 가드: 값이 실제로 줄 때만)
  useEffect(() => {
    if (!scopedSourceIds || srcIds.length === 0) return
    const kept = srcIds.filter((id) => scopedSourceIds.has(id))
    if (kept.length < srcIds.length) updateParam('src', kept.join(','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedSourceIds])

  // ── 콘텐츠 쿼리 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchContents = async () => {
      setLoading(true)
      const supabase = createClient()

      // ① 서비스 멀티셀렉트 필터: 선택된 svcIds 중 하나라도 매핑된 content_ids
      let svcContentIds: string[] | null = null
      if (svcIds.length > 0) {
        const { data } = await supabase
          .from('content_services')
          .select('content_id')
          .in('service_id', svcIds)
        svcContentIds = [...new Set(data?.map((r) => r.content_id) ?? [])]
      }

      if (svcContentIds?.length === 0) {
        if (!cancelled) {
          if (page === 1) setItems([])
          setTotal(0)
          setLoading(false)
        }
        return
      }

      // ③ 메인 쿼리 — relevant='1'이면 서비스 태그 있는 콘텐츠만 노출 (inner join)
      const serviceJoin = relevant === '1'
        ? 'content_services!inner(services(name))'
        : 'content_services(services(name))'

      let q = supabase
        .from('contents')
        .select(
          'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), matched_groups, matched_keywords, cluster_id, importance_score, collected_at',
          { count: 'exact' }
        )
        .eq('status', 'published')

      q = sortByCollected
        ? q.order('collected_at', { ascending: false })
        : q.order('published_at', { ascending: false, nullsFirst: false })

      q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (category) {
        const dbCats = getCategoryDbValues(category as ContentCategory)
        q = q.in('category', dbCats)
      }
      if (srcIds.length > 0) q = q.in('source_id', srcIds)

      const dateStart = getDateStart(date)
      if (dateStart)      q = q.gte(sortByCollected ? 'collected_at' : 'published_at', dateStart)
      if (svcContentIds)  q = q.in('id', svcContentIds)

      const { data, count, error } = await q

      if (!cancelled) {
        if (error) {
          console.error('[contents] 쿼리 오류:', error)
        } else {
          const newItems = (data ?? []) as unknown as ContentItem[]
          setItems(page === 1 ? newItems : (prev) => [...prev, ...newItems])
          setTotal(count ?? 0)
        }
        setLoading(false)
      }
    }

    fetchContents()
    return () => { cancelled = true }
  }, [category, date, svcIds, srcIds, relevant, page, sort, sortByCollected])

  // ── 더 보기 ──────────────────────────────────────────────────────────────────
  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    const p = new URLSearchParams(window.location.search)
    p.set('page', String(next))
    window.history.replaceState(null, '', `${pathname}?${p.toString()}`)
  }
  const hasMore = total !== null && items.length < total

  // ── cluster 그룹핑 (표시 전용 — total·더보기는 원시 items 기준 유지) ──────────
  const clusteredItems = useMemo<ClusteredItem[]>(() => {
    const groups = new Map<string, ContentItem[]>()
    for (const item of items) {
      const key = item.cluster_id ?? item.id
      const grp = groups.get(key)
      if (grp) grp.push(item)
      else groups.set(key, [item])
    }
    const result: ClusteredItem[] = []
    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) => {
        const sd = (b.importance_score ?? 0) - (a.importance_score ?? 0)
        if (sd !== 0) return sd
        return basisTime(b, sortByCollected) - basisTime(a, sortByCollected)
      })
      const [rep, ...rest] = sorted
      result.push({
        item: rep,
        members: rest.map((m) => ({
          name: m.sources?.name ?? m.author ?? '알 수 없음',
          url: m.original_url,
          title: m.title,
        })),
      })
    }
    result.sort((a, b) => basisTime(b.item, sortByCollected) - basisTime(a.item, sortByCollected))
    return result
  }, [items, sortByCollected])

  // ── 활성 필터 chip 목록 (카테고리 칩 제거, 서비스는 선택된 것만) ──────────────
  const activeFilters: { key: string; label: string; onRemove: () => void }[] = []

  if (date !== 'all') activeFilters.push({
    key: 'date',
    label: DATE_OPTIONS.find((d) => d.value === date)?.label ?? date,
    onRemove: () => updateParam('date', ''),
  })

  for (const id of svcIds) {
    const svcName = services.find((s) => s.id === id)?.name ?? '서비스'
    activeFilters.push({
      key: `svc-${id}`,
      label: `사업: ${svcName}`,
      onRemove: () => {
        const cur = new URLSearchParams(window.location.search).get('svc') ?? ''
        const curIds = cur ? cur.split(',').filter(Boolean) : []
        const next = curIds.filter((x) => x !== id)
        updateParam('svc', next.join(','))
      },
    })
  }

  const visibleSources = scopedSourceIds ? sources.filter((s) => scopedSourceIds.has(s.id)) : sources
  for (const grp of selectedGroups(srcIds, visibleSources)) {
    activeFilters.push({
      key: `src-grp-${grp.label}`,
      label: `출처: ${grp.label}`,
      onRemove: () => {
        const next = srcIds.filter((x) => !grp.ids.includes(x))
        updateParam('src', next.join(','))
      },
    })
  }


  // ── 페이지 제목 ──────────────────────────────────────────────────────────────
  const pageTitle = category
    ? (CONTENT_CATEGORY_LABEL[category] ?? category)
    : '전체 콘텐츠'

  // 소스타입 선택 (기본 뉴스)
  const activeSourceTab = (category || '뉴스') as ContentCategory

  return (
    <PageContainer>

      {/* ── 소스타입 선택 바 ─────────────────────────────────────────────────── */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CONTENT_SOURCE_TABS.map((tab) => {
          const isActive = activeSourceTab === tab.value
          const count = catCounts[tab.value]
          return (
            <button
              key={tab.value}
              onClick={() => updateParam('category', tab.value)}
              className={cn(
                'relative flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 transition-colors',
                isActive
                  ? tab.activeBg
                  : `border-border text-muted-foreground ${tab.hoverBg}`,
              )}
            >
              {count !== undefined && count > 0 && (
                <span className="absolute left-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                  {count >= 1000 ? `${Math.floor(count / 1000)}k` : count}
                </span>
              )}
              <tab.Icon className={`h-5 w-5 ${isActive ? '' : tab.color}`} />
              <span className="text-xs font-medium leading-tight">{tab.label}</span>
              {count === 0 && (
                <span className="text-[9px] text-muted-foreground/60">데이터 없음</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 제목 + 건수 + 뷰 토글 */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
          {!isLoading && total !== null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total > 0 ? `총 ${total.toLocaleString()}건` : ''}
            </p>
          )}
        </div>

        {/* 정렬·뷰 토글 그룹 */}
        <div className="flex items-center gap-2">
          {/* 발행순/수집순 토글 (리포트는 항상 수집순이라 숨김) */}
          {!isReportCategory && (
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              <button
                onClick={() => updateParam('sort', '')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  sort === 'published' || !searchParams.get('sort')
                    ? 'bg-brand-600 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                발행순
              </button>
              <button
                onClick={() => updateParam('sort', 'collected')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  sort === 'collected'
                    ? 'bg-brand-600 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                수집순
              </button>
            </div>
          )}

          {/* 일별 묶음 토글 */}
          <button
            onClick={() => setGroupByDay((v) => !v)}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              groupByDay
                ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-700/50 dark:bg-brand-950/30 dark:text-brand-300'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            일별 보기
          </button>

          {/* 카드/목록 토글 */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <button
              onClick={() => handleViewChange('card')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                contentView === 'card'
                  ? 'bg-brand-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="카드 뷰"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              카드
            </button>
            <button
              onClick={() => handleViewChange('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                contentView === 'list'
                  ? 'bg-brand-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="목록 뷰"
            >
              <List className="h-3.5 w-3.5" />
              목록
            </button>
          </div>
        </div>
      </div>

      {/* ─── 필터 바 ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">

          {/* 날짜 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">날짜</span>
            <div className="flex gap-1">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateParam('date', opt.value === 'all' ? '' : opt.value)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    date === opt.value || (opt.value === 'all' && !searchParams.get('date'))
                      ? 'bg-brand-600 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 출처 팝오버 — 우측 끝 (카테고리 있으면 해당 카테고리 출처만) */}
          <div className="ml-auto">
            <SourcePopover
              sources={scopedSourceIds ? sources.filter((s) => scopedSourceIds.has(s.id)) : sources}
              value={srcIds}
              onChange={(ids) => updateParam('src', ids.join(','))}
            />
          </div>


        </div>

        {/* 사업키워드(서비스) 멀티셀렉트 pill 행 */}
        {services.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">사업</span>
              <button
                onClick={() => updateParam('svc', '')}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  svcIds.length === 0
                    ? 'bg-brand-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                전체
              </button>
              {services.map((s) => {
                const isActive = svcIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const cur = new URLSearchParams(window.location.search).get('svc') ?? ''
                      const curIds = cur ? cur.split(',').filter(Boolean) : []
                      const next = curIds.includes(s.id)
                        ? curIds.filter((x) => x !== s.id)
                        : [...curIds, s.id]
                      updateParam('svc', next.join(','))
                    }}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {s.icon ? `${s.icon} ${s.name}` : s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 관련 콘텐츠 토글 */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">관련성</span>
            <button
              onClick={() => updateParam('relevant', relevant === '1' ? '0' : '1')}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                relevant === '1'
                  ? 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100 dark:border-brand-700/50 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:bg-brand-950/50'
                  : 'border-border bg-muted text-muted-foreground hover:bg-accent'
              )}
              title={relevant === '1' ? '전체 콘텐츠 보기' : '관련 콘텐츠만 보기'}
            >
              {relevant === '1' ? '관련 콘텐츠만' : '전체 콘텐츠'}
            </button>
          </div>
        </div>

        {/* 활성 필터 chips */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">적용 중:</span>
            {activeFilters.map((f) => (
              <FilterChip key={f.key} label={f.label} onRemove={f.onRemove} />
            ))}
            <button
              onClick={() => { setPage(1); router.push(pathname + (category ? `?category=${encodeURIComponent(category)}` : '')) }}
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              전체 초기화
            </button>
          </div>
        )}
      </div>

      {/* ─── 콘텐츠 목록 ──────────────────────────────────────────────────────── */}
      {isLoading && page === 1 ? (
        contentView === 'card' ? (
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <span className="text-4xl">🔧</span>
          <p className="text-sm font-medium text-foreground">
            {category ? '콘텐츠를 수집 중입니다' : '해당하는 콘텐츠가 없습니다'}
          </p>
          <p className="text-xs text-muted-foreground">
            {category ? '곧 업데이트됩니다. 다른 카테고리를 먼저 확인해 보세요.' : '필터 조건을 변경해보세요'}
          </p>
        </div>
      ) : (
        <>
          {groupByDay ? (
            /* ── 일별 묶음 보기 ── */
            <div className="space-y-6">
              {groupByKstDay(clusteredItems, sortByCollected).map((seg) => (
                <div key={seg.key}>
                  <p className="sticky top-14 z-10 mb-3 bg-background/90 py-1 text-sm font-semibold text-muted-foreground backdrop-blur-sm">
                    {seg.label}
                  </p>
                  {category === '유튜브' ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {seg.items.map(({ item }) => (
                        <YoutubeVideoCard
                          key={item.id}
                          title={item.title}
                          originalUrl={item.original_url}
                          sourceName={item.sources?.name ?? item.author ?? null}
                          publishedAt={displayDate(item, sortByCollected)}
                        />
                      ))}
                    </div>
                  ) : contentView === 'card' ? (
                    <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                      {seg.items.map(({ item, members }) => (
                        <ContentListCard
                          key={item.id}
                          id={item.id}
                          title={item.title}
                          excerpt={toExcerpt(item.summary_ko, item.body_original)}
                          category={item.category}
                          publishedAt={displayDate(item, sortByCollected)}
                          originalUrl={item.original_url}
                          filePath={item.file_path}
                          isEditorPick={item.is_editor_pick}
                          author={item.author}
                          sourceName={item.sources?.name ?? null}
                          tags={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                          clusterMembers={members.length > 0 ? members : undefined}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {seg.items.map(({ item, members }) => (
                        <ContentRow
                          key={item.id}
                          id={item.id}
                          title={item.title}
                          summaryKo={item.summary_ko}
                          bodyOriginal={item.body_original}
                          category={item.category}
                          publishedAt={displayDate(item, sortByCollected)}
                          originalUrl={item.original_url}
                          filePath={item.file_path}
                          isEditorPick={item.is_editor_pick}
                          author={item.author}
                          sourceName={item.sources?.name ?? null}
                          keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                          clusterMembers={members.length > 0 ? members : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : category === '유튜브' ? (
            /* ── 유튜브 전용 그리드 ── */
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {clusteredItems.map(({ item }) => (
                <YoutubeVideoCard
                  key={item.id}
                  title={item.title}
                  originalUrl={item.original_url}
                  sourceName={item.sources?.name ?? item.author ?? null}
                  publishedAt={displayDate(item, sortByCollected)}
                />
              ))}
            </div>
          ) : contentView === 'card' ? (
            <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {clusteredItems.map(({ item, members }) => (
                <ContentListCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  excerpt={toExcerpt(item.summary_ko, item.body_original)}
                  category={item.category}
                  publishedAt={displayDate(item, sortByCollected)}
                  originalUrl={item.original_url}
                  filePath={item.file_path}
                  isEditorPick={item.is_editor_pick}
                  author={item.author}
                  sourceName={item.sources?.name ?? null}
                  tags={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                  clusterMembers={members.length > 0 ? members : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {clusteredItems.map(({ item, members }) => (
                <ContentRow
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  summaryKo={item.summary_ko}
                  bodyOriginal={item.body_original}
                  category={item.category}
                  publishedAt={displayDate(item, sortByCollected)}
                  originalUrl={item.original_url}
                  filePath={item.file_path}
                  isEditorPick={item.is_editor_pick}
                  author={item.author}
                  sourceName={item.sources?.name ?? null}
                  keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                  clusterMembers={members.length > 0 ? members : undefined}
                />
              ))}
            </div>
          )}

          {/* 더 보기 */}
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  `${PAGE_SIZE}개 더 보기`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default function ContentsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
      <ContentsContent />
    </Suspense>
  )
}
