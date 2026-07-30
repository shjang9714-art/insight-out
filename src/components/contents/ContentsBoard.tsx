'use client'

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { getCategoryDbValues } from '@/lib/categories'
import { LayoutGrid, List, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContentListCard from '@/components/dashboard/ContentListCard'
import ContentCard from '@/components/dashboard/ContentCard'
import ContentReportCard from '@/components/contents/ContentReportCard'
import ContentListRow from '@/components/dashboard/ContentListRow'
import ContentCardSkeleton from '@/components/contents/ContentCardSkeleton'
import { Button } from '@/components/ui/button'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { coverUrlsForList } from '@/lib/contents/topic-cover'

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

function getContentsViewSnapshot(): ContentsView {
  const savedView = window.localStorage.getItem(CONTENTS_VIEW_STORAGE_KEY)
  return savedView === 'list' ? 'list' : 'card'
}

function getContentsViewServerSnapshot(): ContentsView {
  return 'card'
}

function subscribeContentsView(onStoreChange: () => void): () => void {
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

// ─── 로딩 사다리 (394) ────────────────────────────────────────────────────────
// ~200ms: 무표시 → 200ms~: 스켈레톤(뜨면 최소 350ms 유지) → 1.5s~: 안내문구 → 5s~: 지연 안내+재시도.
// 지연·최소유지는 세트로 — 하나만 있으면 경계값에서 반대방향 깜빡임이 남는다.

const SKELETON_SHOW_DELAY_MS = 200
const SKELETON_MIN_VISIBLE_MS = 350
const SLOW_NOTICE_MS = 1_500
const VERY_SLOW_NOTICE_MS = 5_000

type LoadingPhase = 'idle' | 'skeleton' | 'slow' | 'verySlow'

function useLoadingPhase(isLoading: boolean): LoadingPhase {
  const [phase, setPhase] = useState<LoadingPhase>('idle')
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      const showTimer = window.setTimeout(() => {
        shownAtRef.current = Date.now()
        setPhase('skeleton')
      }, SKELETON_SHOW_DELAY_MS)
      const slowTimer = window.setTimeout(() => setPhase('slow'), SLOW_NOTICE_MS)
      const verySlowTimer = window.setTimeout(() => setPhase('verySlow'), VERY_SLOW_NOTICE_MS)
      return () => {
        window.clearTimeout(showTimer)
        window.clearTimeout(slowTimer)
        window.clearTimeout(verySlowTimer)
      }
    }

    const shownAt = shownAtRef.current
    if (shownAt === null) {
      setPhase('idle')
      return
    }
    const elapsed = Date.now() - shownAt
    if (elapsed >= SKELETON_MIN_VISIBLE_MS) {
      shownAtRef.current = null
      setPhase('idle')
      return
    }
    const hideTimer = window.setTimeout(() => {
      shownAtRef.current = null
      setPhase('idle')
    }, SKELETON_MIN_VISIBLE_MS - elapsed)
    return () => window.clearTimeout(hideTimer)
  }, [isLoading])

  return phase
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function ContentCardGrid({ items, category, sortByCollected }: {
  items: ClusteredItem[]
  category: ContentCategory | ''
  sortByCollected: boolean
}) {
  const coverUrls = coverUrlsForList(items.map(({ item }) => item))
  return (
    <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      {items.map(({ item, members }, index) => (
        category === '유튜브' || category === '뉴스' ? (
          <ContentCard
            key={item.id}
            id={item.id}
            title={item.title}
            summaryKo={item.summary_ko ?? null}
            category={item.category}
            sourceName={item.sources?.name ?? item.author ?? null}
            publishedAt={displayDate(item, sortByCollected)}
            thumbnailUrl={coverUrls[index]}
            externalHref={category === '유튜브' ? item.original_url : null}
            keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
            lguImpact={item.lgu_impact ?? null}
          />
        ) : category === '리서치' || category === '지식보고서' ? (
          <ContentReportCard
            key={item.id}
            id={item.id}
            title={item.title}
            summary={toExcerpt(item.summary_ko, item.body_original)}
            category={item.category}
            sourceName={item.sources?.name ?? item.author ?? null}
            publishedAt={displayDate(item, sortByCollected)}
            coverImageUrl={coverUrls[index]}
            keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
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
            thumbnailUrl={coverUrls[index]}
            lguImpact={item.lgu_impact ?? null}
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
  const coverUrls = coverUrlsForList(items.map(({ item }) => item))
  return (
    <div className="space-y-3">
      {items.map(({ item }, index) => (
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
          thumbnailUrl={coverUrls[index]}
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
  schemaPendingMessage?: string
}

export default function ContentsBoard({
  fixedCategory,
  title,
  schemaPendingMessage,
}: ContentsBoardProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // ── URL 파라미터 ─────────────────────────────────────────────────────────────
  // 394 — 무파라미터 진입 시에도 '뉴스'를 즉시 유효 카테고리로 취급해 category='' 1차 쿼리를 없앤다.
  // 아래 useEffect가 URL을 ?category=뉴스로 맞추지만, 그 갱신은 이 값과 동일하므로 재조회를 유발하지 않는다.
  const category = fixedCategory ?? ((searchParams.get('category') as ContentCategory | null) || '뉴스')
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
  const [retryToken, setRetryToken] = useState(0)
  const loadingPhase = useLoadingPhase(isLoading)
  // 395 — 직전 category를 들고 있다가 바뀌면 쿼리 전에 목록을 비운다(잔상 방지).
  const prevCategoryRef = useRef(category)
  const [popularKeywords, setPopularKeywords] = useState<{ name: string; count: number }[]>([])
  const contentsView = useSyncExternalStore(
    subscribeContentsView,
    getContentsViewSnapshot,
    getContentsViewServerSnapshot,
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

    // 395 — 카테고리가 바뀌면 이전 카테고리의 카드가 잔상으로 남지 않도록 쿼리 전에 즉시 비운다.
    // 검색어·키워드 칩·정렬·페이지네이션 변경 시에는(category 불변) 목록을 그대로 유지한다(394 유지).
    if (prevCategoryRef.current !== category) {
      prevCategoryRef.current = category
      setItems([])
      setTotal(null)
    }

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
  }, [category, searchQuery, selectedKeywords, page, sort, sortByCollected, schemaPendingMessage, retryToken])

  // ── 더 보기 ──────────────────────────────────────────────────────────────────
  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    const p = new URLSearchParams(window.location.search)
    p.set('page', String(next))
    window.history.replaceState(null, '', `${pathname}?${p.toString()}`)
  }
  const hasMore = total !== null && items.length < total

  // 394 — 5초 지연 안내의 "다시 시도" 버튼. 의존성 배열의 retryToken만 바꿔 동일 쿼리를 재실행한다.
  const handleRetry = () => setRetryToken((t) => t + 1)

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

  const keywordChips = [
    ...selectedKeywords.map((name) => ({ name })),
    ...popularKeywords.filter(({ name }) => !selectedKeywords.includes(name)),
  ]

  const toggleKeyword = (name: string) => {
    const next = selectedKeywords.includes(name)
      ? selectedKeywords.filter((keyword) => keyword !== name)
      : [...selectedKeywords, name]
    updateParam('kw', next.join(','))
  }

  const clearSearchFilters = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('q')
    params.delete('kw')
    params.delete('page')
    setPage(1)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const changeContentsView = (view: ContentsView) => {
    window.localStorage.setItem(CONTENTS_VIEW_STORAGE_KEY, view)
    window.dispatchEvent(new Event(CONTENTS_VIEW_CHANGE_EVENT))
  }

  // ── 페이지 제목 ──────────────────────────────────────────────────────────────
  const pageTitle = title ?? (category
    ? (CONTENT_CATEGORY_LABEL[category] ?? category)
    : '전체 콘텐츠')

  const supportsViewToggle = category === '뉴스' || category === '웹인사이트'
  const usesContinuousLayout =
    category === '웹인사이트'
    || category === '리서치'
    || category === '지식보고서'
    || category === '유튜브'

  return (
    <>

      {/* 제목 + 건수 */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
          {items.length === 0 && (loadingPhase === 'slow' || loadingPhase === 'verySlow') ? (
            <p className="mt-0.5 text-xs text-muted-foreground">최신 콘텐츠를 불러오는 중</p>
          ) : (
            !isLoading && total !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                총 {total.toLocaleString()}건
              </p>
            )
          )}
        </div>
        {supportsViewToggle && (
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5" role="group" aria-label="콘텐츠 보기 방식">
            <Button
              type="button"
              variant={contentsView === 'card' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => changeContentsView('card')}
              aria-label="카드 보기"
              aria-pressed={contentsView === 'card'}
              title="카드 보기"
            >
              <LayoutGrid aria-hidden />
            </Button>
            <Button
              type="button"
              variant={contentsView === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => changeContentsView('list')}
              aria-label="리스트 보기"
              aria-pressed={contentsView === 'list'}
              title="리스트 보기"
            >
              <List aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* ─── 인기 키워드 ──────────────────────────────────────────────── */}
      <div className="mb-6 space-y-3">
        {/* 394 — 항상 렌더 + 최소 높이 예약(칩 한 줄 높이). /api/contents/keywords 응답이 늦게 와도 아래 목록이 밀리지 않는다. */}
        <div className="flex min-h-[34px] flex-wrap items-center gap-2">
          {keywordChips.map(({ name }) => {
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
                  #{name}
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
      </div>

      {/* ─── 콘텐츠 목록 ──────────────────────────────────────────────────────── */}
      {/* 394 — 원칙: 최초 로딩(목록 없음) = 정확한 스켈레톤 / 재조회(목록 있음) = 기존 목록 유지.
          395 — "이전 목록 유지"는 category 불변(검색·칩·정렬·더보기)에만 적용. category가 바뀌면
          위 useEffect가 즉시 setItems([])하므로 items.length===0 경로(스켈레톤)를 탄다 — 잔상 없음. */}
      {queryError ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {queryError}
        </div>
      ) : items.length === 0 && isLoading ? (
        loadingPhase === 'idle' ? null : (
          <div>
            {loadingPhase === 'verySlow' && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>데이터 응답이 평소보다 늦어지고 있습니다</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  다시 시도
                </button>
              </div>
            )}
            <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {Array.from({ length: 6 }).map((_, i) => <ContentCardSkeleton key={i} index={i} />)}
            </div>
          </div>
        )
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
        <div className="relative">
          {/* 395 — 상단 바 형태의 로딩 표시는 경고 배너처럼 읽혀 삭제. opacity만 유지(검색·칩 전환 시 "바뀌는 중" 최소 신호).
              더 보기(page>1)는 기존 목록 전체가 흐려지면 안 되므로 대상에서 제외한다. */}
          <div className={cn('transition-opacity duration-150', isLoading && page === 1 && 'opacity-[0.85]')}>
            {usesContinuousLayout ? (
              supportsViewToggle && contentsView === 'list' ? (
                <ContentRowList items={clusteredItems} sortByCollected={sortByCollected} />
              ) : (
                <ContentCardGrid items={clusteredItems} category={category} sortByCollected={sortByCollected} />
              )
            ) : (
              <div className="space-y-6">
                {groupByKstDay(clusteredItems, sortByCollected).map((seg) => (
                  <section key={seg.key}>
                    <p className="sticky top-14 z-10 mb-3 bg-background/90 py-1 text-sm font-semibold text-muted-foreground backdrop-blur-sm">
                      {seg.label}
                    </p>
                    {category === '뉴스' && contentsView === 'list' ? (
                      <ContentRowList items={seg.items} sortByCollected={sortByCollected} />
                    ) : (
                      <ContentCardGrid items={seg.items} category={category} sortByCollected={sortByCollected} />
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

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
        </div>
      )}
    </>
  )
}
