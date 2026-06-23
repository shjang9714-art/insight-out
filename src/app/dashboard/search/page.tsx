'use client'

import { Suspense, useEffect, useState, useMemo, useCallback, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { Loader2, Search, Sparkles, X, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContentRow from '@/components/dashboard/ContentRow'
import ContentListCard from '@/components/dashboard/ContentListCard'
import SourcePopover, { selectedGroups } from '@/components/dashboard/SourcePopover'
import { toExcerpt, tagsOf } from '@/lib/contents/excerpt'
import { CATEGORY_DEFS, toDbCategories } from '@/lib/categories'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface SearchResult {
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
  content_keywords: { keywords: { name: string } | null }[]
  content_services: { services: { name: string } | null }[]
  matchedBy?: 'title' | 'summary' | 'body' | 'keyword'
}

interface ServiceOption { id: string; name: string; icon?: string | null }
interface SourceOption  { id: string; name: string; group_name: string | null }

interface RagSource { content_id: string; title: string; published_at: string | null; source: string | null }
interface RagAnswerData { answer: string; citations: string[]; sources: RagSource[] }
type RagState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; data: RagAnswerData }
  | { status: 'none' }

// ─── 상수 ────────────────────────────────────────────────────────────────────

const DATE_OPTIONS = [
  { value: 'all',   label: '전체' },
  { value: 'today', label: '오늘' },
  { value: 'week',  label: '이번 주' },
  { value: 'month', label: '이번 달' },
] as const
type DateFilter = (typeof DATE_OPTIONS)[number]['value']

type ContentView = 'card' | 'list'
const VIEW_KEY = 'io:search-view'
const MAX_RESULTS = 60

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
  if (typeof window === 'undefined') return 'list'
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'card' ? 'card' : 'list'
  } catch {
    return 'list'
  }
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────

function getKeywords(item: SearchResult): string[] {
  return item.content_keywords.map((ck) => ck.keywords?.name).filter((n): n is string => Boolean(n))
}

function getServices(item: SearchResult): string[] {
  return item.content_services.map((cs) => cs.services?.name).filter((n): n is string => Boolean(n))
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700">
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100" aria-label={`${label} 필터 제거`}>
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
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
    </div>
  )
}

// ─── 검색 컨텐츠 ──────────────────────────────────────────────────────────────

function SearchContent() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const q        = searchParams.get('q')?.trim() ?? ''
  const category = (searchParams.get('category') ?? '') as ContentCategory | ''
  const date     = (searchParams.get('date') ?? 'all') as DateFilter
  const svcParam = searchParams.get('svc') ?? ''
  const srcParam = searchParams.get('src') ?? ''
  const svcIds   = useMemo(() => svcParam ? svcParam.split(',').filter(Boolean) : [], [svcParam])
  const srcIds   = useMemo(() => srcParam ? srcParam.split(',').filter(Boolean) : [], [srcParam])

  const [results, setResults]   = useState<SearchResult[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [services, setServices] = useState<ServiceOption[]>([])
  const [sources, setSources]   = useState<SourceOption[]>([])
  const [contentView, setContentView] = useState<ContentView>('list')
  // null = 카테고리 미선택(전체 출처 노출)
  const [scopedSourceIds, setScopedSourceIds] = useState<Set<string> | null>(null)

  // AI 답변
  const [ragState, setRagState] = useState<RagState>({ status: 'idle' })

  useEffect(() => {
    startTransition(() => setContentView(getSavedView()))
  }, [])

  const handleViewChange = (v: ContentView) => {
    setContentView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* noop */ }
  }

  // 서비스·소스 로드 (1회)
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

  // 카테고리별 출처 스코프 조회
  useEffect(() => {
    if (!category) { startTransition(() => setScopedSourceIds(null)); return }
    let cancelled = false
    const dbCats = toDbCategories(category)
    let q = createClient().from('contents').select('source_id').eq('status', 'published').not('source_id', 'is', null)
    q = dbCats.length === 1
      ? q.eq('category', dbCats[0])
      : q.in('category', dbCats.length ? dbCats : ['__none__'])
    q.then(({ data }) => {
        if (cancelled) return
        setScopedSourceIds(new Set((data ?? []).map((r) => r.source_id as string)))
      })
    return () => { cancelled = true }
  }, [category])

  const updateParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      router.push(`${pathname}?${p.toString()}`)
    },
    [router, pathname, searchParams]
  )

  // 카테고리 전환 시 범위 밖 출처 선택 정리 (무한루프 가드: 값이 실제로 줄 때만)
  useEffect(() => {
    if (!scopedSourceIds || srcIds.length === 0) return
    const kept = srcIds.filter((id) => scopedSourceIds.has(id))
    if (kept.length < srcIds.length) updateParam('src', kept.join(','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedSourceIds])

  // FTS 쿼리 (패싯 결합)
  useEffect(() => {
    if (!q) {
      startTransition(() => { setResults(null); setLoading(false) })
      return
    }

    let cancelled = false
    startTransition(() => { setLoading(true); setError(null) })

    const fetchResults = async () => {
      const supabase = createClient()

      // svc 필터: 선택된 서비스와 매핑된 content_ids 선조회
      let svcContentIds: string[] | null = null
      if (svcIds.length > 0) {
        const { data } = await supabase
          .from('content_services')
          .select('content_id')
          .in('service_id', svcIds)
        svcContentIds = [...new Set(data?.map((r) => r.content_id) ?? [])]
        if (svcContentIds.length === 0) {
          if (!cancelled) { setResults([]); setLoading(false) }
          return
        }
      }

      // ILIKE 멀티컬럼 OR 검색 (title·summary_ko·body_original 커버)
      // FTS(search_vector)는 body_original·matched_keywords 미포함으로 단어 누락 발생 → ILIKE 대체
      const escapedQ = q.replace(/[%_]/g, '\\$&')
      const ilikePat = `%${escapedQ}%`
      const orFilter = [
        `title.ilike.${ilikePat}`,
        `summary_ko.ilike.${ilikePat}`,
        `body_original.ilike.${ilikePat}`,
      ].join(',')

      let query = supabase
        .from('contents')
        .select(
          'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name)), content_services(services(name))'
        )
        .or(orFilter)
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(MAX_RESULTS)

      if (category) {
        const dbCats = toDbCategories(category)
        query = dbCats.length === 1
          ? query.eq('category', dbCats[0])
          : query.in('category', dbCats.length ? dbCats : ['__none__'])
      }
      if (srcIds.length > 0) query = query.in('source_id', srcIds)

      const dateStart = getDateStart(date)
      if (dateStart)         query = query.gte('published_at', dateStart)
      if (svcContentIds)     query = query.in('id', svcContentIds)

      const { data, error: err } = await query

      if (!cancelled) {
        if (err) {
          console.error('[search] FTS 쿼리 오류:', err)
          setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setResults((data ?? []) as unknown as SearchResult[])
        }
        setLoading(false)
      }
    }

    fetchResults()
    return () => { cancelled = true }
  }, [q, category, date, svcIds, srcIds])

  // RAG AI 답변 (검색어 변경 시)
  useEffect(() => {
    if (!q) { startTransition(() => setRagState({ status: 'idle' })); return }

    let cancelled = false

    fetch('/api/search/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
      .then(r => r.json())
      .then((data: unknown) => {
        if (cancelled) return
        const d = data as Record<string, unknown>
        if (typeof d.answer === 'string' && d.answer) {
          setRagState({
            status: 'done',
            data: {
              answer: d.answer,
              citations: Array.isArray(d.citations) ? d.citations as string[] : [],
              sources: Array.isArray(d.sources) ? d.sources as RagSource[] : [],
            },
          })
        } else {
          setRagState({ status: 'none' })
        }
      })
      .catch(() => { if (!cancelled) setRagState({ status: 'none' }) })

    return () => { cancelled = true }
  }, [q])

  // 활성 필터 칩
  const activeFilters: { key: string; label: string; onRemove: () => void }[] = []

  if (category) activeFilters.push({
    key: 'cat',
    label: CONTENT_CATEGORY_LABEL[category] ?? category,
    onRemove: () => updateParam('category', ''),
  })

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

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* 브레드크럼 */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">대시보드</Link>
        <span>›</span>
        <span className="font-medium text-foreground">검색</span>
        {q && (
          <>
            <span>›</span>
            <span className="max-w-xs truncate font-medium text-brand-600">&ldquo;{q}&rdquo;</span>
          </>
        )}
      </div>

      {/* 헤더 + 뷰 토글 */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {q ? `"${q}" 검색 결과` : '콘텐츠 검색'}
            </h1>
            {!isLoading && results !== null && (
              <p className="text-xs text-muted-foreground">
                총 {results.length}건{results.length === MAX_RESULTS && ' (최대 60건 표시)'}
              </p>
            )}
          </div>
        </div>

        {/* 카드/목록 뷰 토글 */}
        {q && (
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <button
              onClick={() => handleViewChange('card')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                contentView === 'card' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground'
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
                contentView === 'list' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="목록 뷰"
            >
              <List className="h-3.5 w-3.5" />
              목록
            </button>
          </div>
        )}
      </div>

      {/* 패싯 필터바 — 검색어 있을 때만 */}
      {q && (
        <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3.5">

          {/* 날짜 + 출처 팝오버 한 줄 */}
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
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

          {/* 카테고리 */}
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">카테고리</span>
              <button
                onClick={() => updateParam('category', '')}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  !category ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                전체
              </button>
              {CATEGORY_DEFS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => updateParam('category', category === def.category ? '' : def.category)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    category === def.category ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {def.label}
                </button>
              ))}
            </div>
          </div>

          {/* 사업 */}
          {services.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">사업</span>
                <button
                  onClick={() => updateParam('svc', '')}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    svcIds.length === 0 ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  전체
                </button>
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const next = svcIds.includes(s.id) ? svcIds.filter((x) => x !== s.id) : [...svcIds, s.id]
                      updateParam('svc', next.join(','))
                    }}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      svcIds.includes(s.id) ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {s.icon ? `${s.icon} ${s.name}` : s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 활성 필터 칩 */}
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-[11px] text-muted-foreground">적용 중:</span>
              {activeFilters.map((f) => (
                <FilterChip key={f.key} label={f.label} onRemove={f.onRemove} />
              ))}
              <button
                onClick={() => {
                  const p = new URLSearchParams()
                  if (q) p.set('q', q)
                  router.push(`${pathname}?${p.toString()}`)
                }}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                전체 초기화
              </button>
            </div>
          )}
        </div>
      )}

      {/* 검색어 없음 */}
      {!q && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
          <p className="text-xs text-muted-foreground">
            상단 검색창에 제목이나 요약 키워드를 입력하고 Enter 를 누르세요
          </p>
        </div>
      )}

      {/* 로딩 */}
      {q && isLoading && (
        contentView === 'card' ? (
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )
      )}

      {/* 에러 */}
      {q && error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 결과 없음 */}
      {q && !isLoading && results !== null && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-sm font-medium text-foreground">
            <span className="text-brand-600">&ldquo;{q}&rdquo;</span>에 대한 검색 결과가 없습니다
          </p>
          <p className="text-xs text-muted-foreground">다른 키워드로 다시 검색해보세요</p>
        </div>
      )}

      {/* AI 답변 카드 */}
      {q && ragState.status === 'loading' && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          AI가 수집된 기사를 바탕으로 답변을 정리하고 있어요…
        </div>
      )}
      {q && ragState.status === 'done' && (
        <div className="mb-5 rounded-xl border border-border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="text-sm font-semibold text-foreground">AI 답변</span>
            <span className="text-xs text-muted-foreground">수집된 기사들을 근거로 정리했어요. 아래 출처를 확인하세요.</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ragState.data.answer}</p>
          {ragState.data.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ragState.data.sources.map(s => (
                <Link
                  key={s.content_id}
                  href={`/dashboard/contents/${s.content_id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 transition-colors line-clamp-1 max-w-[240px]"
                >
                  {s.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 결과 목록 */}
      {q && !isLoading && results !== null && results.length > 0 && (
        contentView === 'card' ? (
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {results.map((item) => (
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
                tags={tagsOf(getKeywords(item), item.category, getServices(item))}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((item) => (
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
                keywords={tagsOf(getKeywords(item), item.category, getServices(item))}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
      <SearchContent />
    </Suspense>
  )
}
