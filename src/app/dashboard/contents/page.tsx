'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { X, Loader2, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContentRow from '@/components/dashboard/ContentRow'
import ContentListCard from '@/components/dashboard/ContentListCard'
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
  const srcParam = searchParams.get('src') ?? ''
  const srcIds   = useMemo(() => srcParam ? srcParam.split(',').filter(Boolean) : [], [srcParam])
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [services, setServices]   = useState<ServiceOption[]>([])
  const [sources, setSources]     = useState<SourceOption[]>([])
  const [contentView, setContentView] = useState<ContentView>('card')
  // null = 카테고리 미선택(전체 출처 노출)
  const [scopedSourceIds, setScopedSourceIds] = useState<Set<string> | null>(null)

  // localStorage에서 뷰 설정 복원 (SSR 가드)
  useEffect(() => {
    startTransition(() => setContentView(getSavedView()))
  }, [])

  const handleViewChange = (v: ContentView) => {
    setContentView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* noop */ }
  }

  // ── URL 업데이트 헬퍼 ────────────────────────────────────────────────────────
  const updateParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      if (key !== 'page') p.delete('page')
      router.push(`${pathname}?${p.toString()}`)
    },
    [router, pathname, searchParams]
  )

  // ── 서비스·소스 목록 로드 (1회) ────────────────────────────────────────────
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
    createClient()
      .from('contents')
      .select('source_id')
      .eq('status', 'published')
      .eq('category', category)
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

      // ③ 메인 쿼리 (keywords 조인 추가)
      let q = supabase
        .from('contents')
        .select(
          'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), matched_groups, matched_keywords',
          { count: 'exact' }
        )
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (category)        q = q.eq('category', category)
      if (srcIds.length > 0) q = q.in('source_id', srcIds)

      const dateStart = getDateStart(date)
      if (dateStart)      q = q.gte('published_at', dateStart)
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
  }, [category, date, svcIds, srcIds, page])

  // ── 더 보기 ──────────────────────────────────────────────────────────────────
  const handleLoadMore = () => updateParam('page', String(page + 1))
  const hasMore = total !== null && items.length < total

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
        const next = svcIds.filter((x) => x !== id)
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

  return (
    <div className="px-4 py-6 sm:px-6">
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
                      const next = svcIds.includes(s.id)
                        ? svcIds.filter((x) => x !== s.id)
                        : [...svcIds, s.id]
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

        {/* 활성 필터 chips */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">적용 중:</span>
            {activeFilters.map((f) => (
              <FilterChip key={f.key} label={f.label} onRemove={f.onRemove} />
            ))}
            <button
              onClick={() => router.push(pathname + (category ? `?category=${encodeURIComponent(category)}` : ''))}
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
          <span className="text-4xl">📭</span>
          <p className="text-sm font-medium text-foreground">해당하는 콘텐츠가 없습니다</p>
          <p className="text-xs text-muted-foreground">필터 조건을 변경해보세요</p>
        </div>
      ) : (
        <>
          {contentView === 'card' ? (
            <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {items.map((item) => (
                <ContentListCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  excerpt={toExcerpt(item.summary_ko, item.body_original)}
                  category={item.category}
                  publishedAt={item.published_at}
                  originalUrl={item.original_url}
                  filePath={item.file_path}
                  isEditorPick={item.is_editor_pick}
                  author={item.author}
                  sourceName={item.sources?.name ?? null}
                  tags={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <ContentRow
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  summaryKo={item.summary_ko}
                  bodyOriginal={item.body_original}
                  category={item.category}
                  publishedAt={item.published_at}
                  originalUrl={item.original_url}
                  filePath={item.file_path}
                  isEditorPick={item.is_editor_pick}
                  author={item.author}
                  sourceName={item.sources?.name ?? null}
                  keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
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
    </div>
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
