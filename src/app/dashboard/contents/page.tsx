'use client'

import { Suspense, useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { ExternalLink, FileText, X, Loader2, LayoutGrid, List } from 'lucide-react'
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

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 border-blue-100',
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'AI보고서':  'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
}

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

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card px-5 py-3.5">
      <div className="mb-1.5 h-4 w-16 rounded-full bg-muted" />
      <div className="mb-1 h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/3 rounded bg-muted" />
    </div>
  )
}

function ContentCard({ item }: { item: ContentItem }) {
  const catStyle = CATEGORY_STYLE[item.category] ?? 'bg-muted text-muted-foreground border-border'
  const dateStr  = formatDate(item.published_at)
  const isYoutube = item.category === '유튜브'
  const keywords = getKeywords(item).slice(0, 4)

  const innerContent = (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${catStyle}`}
        >
          {CONTENT_CATEGORY_LABEL[item.category] ?? item.category}
        </span>
        {item.is_editor_pick && (
          <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            ⭐ 에디터 픽
          </span>
        )}
      </div>

      <h2 className="mb-1.5 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
        {item.title}
      </h2>

      {item.summary_ko && (
        <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {item.summary_ko}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        {item.sources?.name && (
          <span className="font-medium text-muted-foreground">{item.sources.name}</span>
        )}
        {item.author && !item.sources?.name && <span>{item.author}</span>}
        <span>{dateStr ? `발행 ${dateStr}` : '발행일 미상'}</span>
      </div>

      {keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <span key={kw} className="text-[11px] text-brand-600">
              #{kw}
            </span>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <article className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        {isYoutube ? (
          innerContent
        ) : (
          <Link href={`/dashboard/contents/${item.id}`} className="min-w-0 flex-1">
            {innerContent}
          </Link>
        )}

        <div className="shrink-0 pt-0.5">
          {item.original_url ? (
            <a
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              원문
            </a>
          ) : item.file_path ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              리포트
            </span>
          ) : null}
        </div>
      </div>
    </article>
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
  const kw       = searchParams.get('kw') ?? ''
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [services, setServices]   = useState<ServiceOption[]>([])
  const [sources, setSources]     = useState<SourceOption[]>([])
  const [kwInput, setKwInput]     = useState(kw)
  const [contentView, setContentView] = useState<ContentView>('card')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ── 서비스 pill 토글 ────────────────────────────────────────────────────────
  const toggleService = useCallback(
    (id: string) => {
      const next = svcIds.includes(id)
        ? svcIds.filter((s) => s !== id)
        : [...svcIds, id]
      updateParam('svc', next.join(','))
    },
    [svcIds, updateParam]
  )

  // ── keyword 디바운스 ─────────────────────────────────────────────────────────
  useEffect(() => { startTransition(() => setKwInput(kw)) }, [kw])

  const handleKwChange = (val: string) => {
    setKwInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateParam('kw', val.trim()), 500)
  }

  // ── 서비스·소스 목록 로드 (1회) ──────────────────────────────────────────────
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

      // ② 키워드 필터: content_ids 구하기
      let kwContentIds: string[] | null = null
      if (kw) {
        const { data: kwRows } = await supabase
          .from('keywords')
          .select('id')
          .ilike('name', `%${kw}%`)
        const kwIds = kwRows?.map((k) => k.id) ?? []
        if (kwIds.length > 0) {
          const { data: ckRows } = await supabase
            .from('content_keywords')
            .select('content_id')
            .in('keyword_id', kwIds)
          kwContentIds = [...new Set(ckRows?.map((r) => r.content_id) ?? [])]
        } else {
          kwContentIds = []
        }
      }

      if (svcContentIds?.length === 0 || kwContentIds?.length === 0) {
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

      if (category)      q = q.eq('category', category)
      if (src)           q = q.eq('source_id', src)

      const dateStart = getDateStart(date)
      if (dateStart)       q = q.gte('published_at', dateStart)
      if (svcContentIds)   q = q.in('id', svcContentIds)
      if (kwContentIds)    q = q.in('id', kwContentIds)

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
  }, [category, date, svcIds, src, kw, page])

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
      onRemove: () => toggleService(id),
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
  if (kw) activeFilters.push({
    key: 'kw',
    label: `키워드: ${kw}`,
    onRemove: () => { setKwInput(''); updateParam('kw', '') },
  })

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
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">

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

          <div className="h-4 w-px self-center bg-border" />

          {/* 출처 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">출처</span>
            <select
              value={src}
              onChange={(e) => updateParam('src', e.target.value)}
              className="rounded-lg border border-border bg-background py-1.5 pl-2.5 pr-7 text-xs text-foreground focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:text-muted-foreground"
              disabled={sources.length === 0}
            >
              <option value="">전체</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px self-center bg-border" />

          {/* 키워드 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">키워드</span>
            <div className="relative">
              <input
                type="text"
                value={kwInput}
                onChange={(e) => handleKwChange(e.target.value)}
                placeholder="예: AI 에이전트"
                className="w-32 rounded-lg border border-border bg-background py-1.5 pl-2.5 pr-7 text-xs text-foreground placeholder-muted-foreground focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100"
              />
              {kwInput && (
                <button
                  onClick={() => { setKwInput(''); updateParam('kw', '') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="키워드 지우기"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
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
                    onClick={() => toggleService(s.id)}
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
              <FilterChip
                key={f.key}
                label={f.label}
                onRemove={f.onRemove}
              />
            ))}
            <button
              onClick={() => {
                setKwInput('')
                router.push(pathname + (category ? `?category=${encodeURIComponent(category)}` : ''))
              }}
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              전체 초기화
            </button>
          </div>
        )}
      </div>

      {/* ─── 콘텐츠 목록 ──────────────────────────────────────────────────────── */}
      {isLoading && page === 1 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <span className="text-4xl">📭</span>
          <p className="text-sm font-medium text-foreground">해당하는 콘텐츠가 없습니다</p>
          <p className="text-xs text-muted-foreground">필터 조건을 변경해보세요</p>
        </div>
      ) : (
        <>
          {contentView === 'card' ? (
            <div className="space-y-3">
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
