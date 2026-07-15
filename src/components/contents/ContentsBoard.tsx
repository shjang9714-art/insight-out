'use client'

import { useState, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { getCategoryDbValues } from '@/lib/categories'
import { LayoutGrid, List, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContentListCard from '@/components/dashboard/ContentListCard'
import ContentCard from '@/components/dashboard/ContentCard'
import ContentListRow from '@/components/dashboard/ContentListRow'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { coverUrlFor } from '@/lib/contents/topic-cover'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

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
  thumbnail_url: string | null
  /** LG U+ 관점 위기/기회(313) — 컬럼 미적용 시 undefined 취급(lguImpactAvailable=false) */
  lgu_impact?: string | null
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

// ─── 상수 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const CONTENTS_VIEW_STORAGE_KEY = 'io:contents-view'
const CONTENTS_VIEW_CHANGE_EVENT = 'io:contents-view-change'
type ContentsView = 'card' | 'list'

function getNewsViewSnapshot(): ContentsView {
  const savedView = window.localStorage.getItem(CONTENTS_VIEW_STORAGE_KEY)
  return savedView === 'list' ? 'list' : 'card'
}

function getNewsViewServerSnapshot(): ContentsView {
  return 'card'
}

function subscribeNewsView(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CONTENTS_VIEW_STORAGE_KEY) onStoreChange()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(CONTENTS_VIEW_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(CONTENTS_VIEW_CHANGE_EVENT, onStoreChange)
  }
}

// 콘텐츠 소스타입 선택 바 (리서치는 리포트 > 외부 리포트로 이동)
const CONTENT_SOURCE_TABS = [
  { label: '뉴스',      value: '뉴스'      as ContentCategory },
  { label: '유튜브',    value: '유튜브'    as ContentCategory },
  { label: '웹인사이트', value: '웹인사이트' as ContentCategory },
] as const

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function displayDate(item: ContentItem, sortByCollected: boolean): string | null {
  if (sortByCollected || item.category === '리포트' || item.category === 'AI보고서' || item.category === '지식보고서') {
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

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

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

function ContentCardGrid({ items, category, sortByCollected }: {
  items: ClusteredItem[]
  category: ContentCategory | ''
  sortByCollected: boolean
}) {
  return (
    <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      {items.map(({ item, members }) => (
        category === '유튜브' || category === '뉴스' ? (
          <ContentCard
            key={item.id}
            id={item.id}
            title={item.title}
            summaryKo={item.summary_ko ?? null}
            category={item.category}
            sourceName={item.sources?.name ?? item.author ?? null}
            publishedAt={displayDate(item, sortByCollected)}
            thumbnailUrl={coverUrlFor(item)}
            externalHref={category === '유튜브' ? item.original_url : null}
            keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
            lguImpact={item.lgu_impact ?? null}
          />
        ) : (
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
            thumbnailUrl={coverUrlFor(item)}
            lguImpact={item.lgu_impact ?? null}
            showPublishedDateBadge={category === '리서치' || category === '지식보고서'}
          />
        )
      ))}
    </div>
  )
}

function ContentRowList({ items, sortByCollected }: {
  items: ClusteredItem[]
  sortByCollected: boolean
}) {
  return (
    <div className="space-y-3">
      {items.map(({ item }) => (
        <ContentListRow
          key={item.id}
          id={item.id}
          title={item.title}
          excerpt={toExcerpt(item.summary_ko, item.body_original)}
          category={item.category}
          publishedAt={displayDate(item, sortByCollected)}
          originalUrl={item.original_url}
          sourceName={item.sources?.name ?? item.author ?? null}
          tags={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
          thumbnailUrl={coverUrlFor(item)}
          lguImpact={item.lgu_impact ?? null}
        />
      ))}
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface ContentsBoardProps {
  fixedCategory?: ContentCategory
  title?: string
  showSourceTabs?: boolean
  schemaPendingMessage?: string
}

export default function ContentsBoard({
  fixedCategory,
  title,
  showSourceTabs = true,
  schemaPendingMessage,
}: ContentsBoardProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // ── URL 파라미터 ─────────────────────────────────────────────────────────────
  const category = fixedCategory ?? (searchParams.get('category') ?? '') as ContentCategory | ''
  const searchQuery = searchParams.get('q')?.trim().slice(0, 100) ?? ''
  const keywordParam = searchParams.get('kw') ?? ''
  const selectedKeywords = useMemo(
    () => [...new Set(keywordParam.split(',').map((value) => value.trim()).filter(Boolean))],
    [keywordParam]
  )
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)))
  const sort     = (searchParams.get('sort') ?? 'published') as 'published' | 'collected'

  const isReportCategory = category === '리포트' || category === 'AI보고서' || category === '지식보고서'
  const sortByCollected  = sort === 'collected' || isReportCategory

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [searchState, setSearchState] = useState({ source: searchQuery, input: searchQuery })
  const [popularKeywords, setPopularKeywords] = useState<{ name: string; count: number }[]>([])
  const newsView = useSyncExternalStore(
    subscribeNewsView,
    getNewsViewSnapshot,
    getNewsViewServerSnapshot,
  )
  // lgu_impact 컬럼 미적용(42703) 시 false — select 에서 제외하되 카드 배지는 유지한다.
  const [lguImpactAvailable, setLguImpactAvailable] = useState(true)

  // 진입 시 카테고리 미지정이면 '뉴스'로 기본 설정 (URL 반영)
  useEffect(() => {
    if (!fixedCategory && !searchParams.get('category')) {
      router.replace(`${pathname}?category=뉴스`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── URL 업데이트 헬퍼 ────────────────────────────────────────────────────────
  // window.location.search 를 사용해 Link 이동 직후 stale 클로저 방지
  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    if (key !== 'page') {
      params.delete('page')
      setPage(1)
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  // 브라우저 탐색으로 q가 바뀐 경우에만 입력 초안을 새 URL 상태에 맞춘다.
  if (searchState.source !== searchQuery) {
    setSearchState({ source: searchQuery, input: searchQuery })
  }
  const searchInput = searchState.input

  // 입력 중에는 URL과 목록 쿼리를 갱신하지 않고, 마지막 입력 300ms 뒤 한 번만 반영한다.
  useEffect(() => {
    const normalized = searchInput.trim().slice(0, 100)
    if (normalized === searchQuery) return

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      if (normalized) params.set('q', normalized)
      else params.delete('q')
      params.delete('page')
      setPage(1)
      router.replace(`${pathname}?${params.toString()}`)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchInput, searchQuery, router, pathname])

  // 현재 소스타입의 최근 30일 인기 키워드를 가져온다.
  useEffect(() => {
    if (!category) return
    const controller = new AbortController()
    const params = new URLSearchParams({ category, limit: '12' })

    fetch(`/api/contents/keywords?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('인기 키워드 조회 실패')
        return response.json() as Promise<{ keywords: { name: string; count: number }[] }>
      })
      .then(({ keywords }) => setPopularKeywords(keywords))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!schemaPendingMessage) console.error('[contents] 인기 키워드 조회 오류:', error)
        setPopularKeywords([])
      })

    return () => controller.abort()
  }, [category, schemaPendingMessage])

  // ── 콘텐츠 쿼리 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchContents = async () => {
      setLoading(true)
      const supabase = createClient()

      // 313 — lgu_impact 컬럼(select·필터)은 가용성 플래그에 따라 켜고 끈다(42703 graceful).
      const baseFields = 'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), matched_groups, matched_keywords, cluster_id, importance_score, collected_at, thumbnail_url'
      const shouldFetchCount = page === 1 || total === null

      const buildQuery = (withLguImpact: boolean) => {
        let query = supabase
          .from('contents')
          .select(withLguImpact ? `${baseFields}, lgu_impact` : baseFields, shouldFetchCount ? { count: 'exact' } : undefined)
          .eq('status', 'published')

        query = sortByCollected
          ? query.order('collected_at', { ascending: false })
          : query.order('published_at', { ascending: false, nullsFirst: false })

        query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (category) {
          const dbCats = getCategoryDbValues(category as ContentCategory)
          query = query.in('category', dbCats)
        }
        if (searchQuery) {
          const escapedQuery = searchQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          query = query.or(`title.ilike."%${escapedQuery}%",summary_ko.ilike."%${escapedQuery}%"`)
        }
        if (selectedKeywords.length > 0) query = query.overlaps('matched_keywords', selectedKeywords)

        return query
      }

      let { data, count, error } = await buildQuery(lguImpactAvailable)

      // lgu_impact 컬럼 미적용(313 SQL 전) — 컬럼 없이 재조회한다.
      if (error?.code === '42703') {
        if (!cancelled) setLguImpactAvailable(false)
        const retry = await buildQuery(false)
        data = retry.data
        count = retry.count
        error = retry.error
      }

      if (!cancelled) {
        if (error) {
          const schemaMissing = error.code === '22P02'
            || error.code === '42P01'
            || error.code === 'PGRST205'
            || error.message.includes('지식보고서')
          if (!schemaMissing) console.error('[contents] 쿼리 오류:', error)
          setQueryError(schemaMissing && schemaPendingMessage
            ? schemaPendingMessage
            : '콘텐츠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
          setItems([])
          setTotal(0)
        } else {
          setQueryError(null)
          const newItems = (data ?? []) as unknown as ContentItem[]
          setItems(page === 1 ? newItems : (prev) => [...prev, ...newItems])
          if (shouldFetchCount) setTotal(count ?? 0)
        }
        setLoading(false)
      }
    }

    fetchContents()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, searchQuery, selectedKeywords, page, sort, sortByCollected, schemaPendingMessage])

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

  const keywordCountByName = new Map(popularKeywords.map((keyword) => [keyword.name, keyword.count]))
  const keywordChips = [
    ...selectedKeywords.map((name) => ({ name, count: keywordCountByName.get(name) })),
    ...popularKeywords.filter(({ name }) => !selectedKeywords.includes(name)),
  ]

  const toggleKeyword = (name: string) => {
    const next = selectedKeywords.includes(name)
      ? selectedKeywords.filter((keyword) => keyword !== name)
      : [...selectedKeywords, name]
    updateParam('kw', next.join(','))
  }

  const clearSearchFilters = () => {
    setSearchState((current) => ({ ...current, input: '' }))
    const params = new URLSearchParams(window.location.search)
    params.delete('q')
    params.delete('kw')
    params.delete('page')
    setPage(1)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const changeNewsView = (view: ContentsView) => {
    window.localStorage.setItem(CONTENTS_VIEW_STORAGE_KEY, view)
    window.dispatchEvent(new Event(CONTENTS_VIEW_CHANGE_EVENT))
  }

  // ── 페이지 제목 ──────────────────────────────────────────────────────────────
  const pageTitle = title ?? (category
    ? (CONTENT_CATEGORY_LABEL[category] ?? category)
    : '전체 콘텐츠')

  // 소스타입 선택 (기본 뉴스)
  const activeSourceTab = (category || '뉴스') as ContentCategory
  const usesFlatList = category === '리서치' || category === '지식보고서' || category === '유튜브'

  return (
    <>

      {/* ── 소스타입 선택 바 ─────────────────────────────────────────────────── */}
      {showSourceTabs && (
        <NavGroupAlign className="-mt-3 mb-5">
          <InsightViewTabs
            items={CONTENT_SOURCE_TABS.map((tab) => ({
              id: tab.value,
              label: tab.label,
            }))}
            value={activeSourceTab}
            onChange={(v) => updateParam('category', v)}
          />
        </NavGroupAlign>
      )}

      {/* 제목 + 건수 */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
          {!isLoading && total !== null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              총 {total.toLocaleString()}건
            </p>
          )}
        </div>
        {category === '뉴스' && (
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5" role="group" aria-label="뉴스 보기 방식">
            <Button
              type="button"
              variant={newsView === 'card' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => changeNewsView('card')}
              aria-label="카드 보기"
              aria-pressed={newsView === 'card'}
              title="카드 보기"
            >
              <LayoutGrid aria-hidden />
            </Button>
            <Button
              type="button"
              variant={newsView === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => changeNewsView('list')}
              aria-label="리스트 보기"
              aria-pressed={newsView === 'list'}
              title="리스트 보기"
            >
              <List aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* ─── 검색 + 인기 키워드 ──────────────────────────────────────────────── */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchState((current) => ({ ...current, input: event.target.value }))}
            placeholder="제목·요약에서 검색…"
            aria-label="콘텐츠 제목과 요약 검색"
            className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchState((current) => ({ ...current, input: '' }))}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {keywordChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {keywordChips.map(({ name, count }) => {
              const isSelected = selectedKeywords.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleKeyword(name)}
                  aria-pressed={isSelected}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    isSelected
                      ? 'bg-brand-solid text-white hover:bg-brand-solid-hover'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  #{name}{count !== undefined ? ` ${count}` : ''}
                </button>
              )
            })}
            {(searchQuery || selectedKeywords.length > 0) && (
              <button
                type="button"
                onClick={clearSearchFilters}
                className="px-1 py-1.5 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                모두 지우기
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── 콘텐츠 목록 ──────────────────────────────────────────────────────── */}
      {queryError ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {queryError}
        </div>
      ) : isLoading && page === 1 ? (
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <p className="text-sm font-medium text-foreground">
            {searchQuery || selectedKeywords.length > 0
              ? '조건에 맞는 콘텐츠가 없습니다.'
              : '아직 등록된 콘텐츠가 없습니다.'}
          </p>
          {(searchQuery || selectedKeywords.length > 0) && (
            <button
              type="button"
              onClick={clearSearchFilters}
              className="text-xs font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700"
            >
              필터 지우기
            </button>
          )}
        </div>
      ) : (
        <>
          {usesFlatList ? (
            <ContentCardGrid items={clusteredItems} category={category} sortByCollected={sortByCollected} />
          ) : (
            <div className="space-y-6">
              {groupByKstDay(clusteredItems, sortByCollected).map((seg) => (
                <section key={seg.key}>
                  <p className="sticky top-14 z-10 mb-3 bg-background/90 py-1 text-sm font-semibold text-muted-foreground backdrop-blur-sm">
                    {seg.label}
                  </p>
                  {category === '뉴스' && newsView === 'list' ? (
                    <ContentRowList items={seg.items} sortByCollected={sortByCollected} />
                  ) : (
                    <ContentCardGrid items={seg.items} category={category} sortByCollected={sortByCollected} />
                  )}
                </section>
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
    </>
  )
}
