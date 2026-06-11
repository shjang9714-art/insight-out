'use client'

import { Suspense, useState, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { ExternalLink, FileText, X, Loader2, LayoutGrid, List, ChevronDown, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContentRow from '@/components/dashboard/ContentRow'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentItem {
  id: string
  title: string
  summary_ko: string | null
  category: ContentCategory
  published_at: string | null
  file_path: string | null
  original_url: string | null
  is_editor_pick: boolean
  author: string | null
  sources: { name: string } | null
  content_keywords: { keywords: { name: string } | null }[]
}

interface ServiceOption {
  id: string
  name: string
  icon?: string | null
}

interface SourceOption {
  id: string
  name: string
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

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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

function getKeywords(item: ContentItem): string[] {
  return item.content_keywords
    .map((ck) => ck.keywords?.name)
    .filter((n): n is string => Boolean(n))
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

// ─── 출처 드롭다운 ────────────────────────────────────────────────────────────

function SourceDropdown({
  sources,
  value,
  onChange,
}: {
  sources: SourceOption[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = sources.find((s) => s.id === value)

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const el = document.getElementById('source-dropdown-panel')
      const btn = document.getElementById('source-dropdown-btn')
      if (el && !el.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (sources.length === 0) return null

  return (
    <div className="relative ml-auto">
      <button
        id="source-dropdown-btn"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
          value
            ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400'
            : 'border-border bg-card text-muted-foreground hover:border-brand-200 hover:text-foreground'
        )}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">{selected?.name ?? '출처 전체'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="source-dropdown-panel"
          className="absolute right-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="max-h-64 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                !value ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400' : 'text-foreground hover:bg-accent'
              )}
            >
              전체 출처
            </button>
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false) }}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition-colors',
                  value === s.id ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-400' : 'text-foreground hover:bg-accent'
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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

function ContentCard({ item }: { item: ContentItem }) {
  const dateStr   = formatDate(item.published_at)
  const isYoutube = item.category === '유튜브'
  const keywords  = getKeywords(item).slice(0, 4)

  const inner = (
    <div className="flex h-full flex-col p-5">
      {/* 상단: 해시태그 + 에디터픽 */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
          >
            #{kw}
          </span>
        ))}
        {item.is_editor_pick && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⭐ 에디터 픽
          </span>
        )}
        {keywords.length === 0 && !item.is_editor_pick && (
          <span className="invisible text-[11px]">placeholder</span>
        )}
      </div>

      {/* 중간: 제목 */}
      <h2 className="mb-2.5 line-clamp-2 text-[15px] font-bold leading-snug text-foreground transition-colors group-hover:text-brand-600">
        {item.title}
      </h2>

      {/* 요약 발췌 */}
      <p className="mb-4 line-clamp-3 flex-1 text-[13px] leading-relaxed text-foreground/70 dark:text-foreground/60">
        {item.summary_ko ?? '요약 정보가 없습니다.'}
      </p>

      {/* 풋터: 메타 + 액션 */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/60">
        <p className="truncate text-[11px] text-muted-foreground">
          {[item.sources?.name ?? item.author, dateStr ? `발행 ${dateStr}` : '발행일 미상']
            .filter(Boolean)
            .join(' · ')}
        </p>
        {item.original_url && (
          <a
            href={item.original_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            <ExternalLink className="h-3 w-3" />
            원문
          </a>
        )}
        {!item.original_url && item.file_path && (
          <span className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            리포트
          </span>
        )}
      </div>
    </div>
  )

  const cardClass =
    'group flex flex-col rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-brand-200 hover:shadow-md'

  if (isYoutube) {
    return <article className={cardClass}>{inner}</article>
  }

  return (
    <Link href={`/dashboard/contents/${item.id}`} className={cardClass}>
      <article className="h-full">{inner}</article>
    </Link>
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
  const src      = searchParams.get('src') ?? ''
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [services, setServices]   = useState<ServiceOption[]>([])
  const [sources, setSources]     = useState<SourceOption[]>([])
  const [contentView, setContentView] = useState<ContentView>('card')

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
      supabase.from('sources').select('id, name').order('name'),
    ]).then(([{ data: svcs }, { data: srcs }]) => {
      if (svcs) setServices(svcs as ServiceOption[])
      if (srcs) setSources(srcs as SourceOption[])
    })
  }, [])

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
          'id, title, summary_ko, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name))',
          { count: 'exact' }
        )
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (category) q = q.eq('category', category)
      if (src)      q = q.eq('source_id', src)

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
  }, [category, date, svcIds, src, page])

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

  if (src) {
    const srcName = sources.find((s) => s.id === src)?.name ?? '출처'
    activeFilters.push({
      key: 'src',
      label: `출처: ${srcName}`,
      onRemove: () => updateParam('src', ''),
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

          {/* 출처 드롭다운 — 우측 끝 */}
          <SourceDropdown
            sources={sources}
            value={src}
            onChange={(v) => updateParam('src', v)}
          />

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
                <ContentCard key={item.id} item={item} />
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
                  category={item.category}
                  publishedAt={item.published_at}
                  originalUrl={item.original_url}
                  filePath={item.file_path}
                  isEditorPick={item.is_editor_pick}
                  author={item.author}
                  sourceName={item.sources?.name ?? null}
                  keywords={getKeywords(item)}
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
