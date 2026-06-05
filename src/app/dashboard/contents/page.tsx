'use client'

import { Suspense, useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { ExternalLink, FileText, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

interface DropdownOption {
  id: string
  name: string
  icon?: string | null
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const DATE_OPTIONS = [
  { value: 'all',   label: '전체' },
  { value: 'today', label: '오늘' },
  { value: 'week',  label: '이번 주' },
  { value: 'month', label: '이번 달' },
] as const
type DateFilter = (typeof DATE_OPTIONS)[number]['value']

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':     'bg-blue-50 text-blue-700 border-blue-100',
  '가트너':   'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':     'bg-orange-50 text-orange-700 border-orange-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  '오피니언': 'bg-green-50 text-green-700 border-green-100',
  '뉴스레터': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'AI보고서': 'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':   'bg-red-50 text-red-700 border-red-100',
}

const PAGE_SIZE = 20

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
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
    <div className="animate-pulse rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-3 h-5 w-16 rounded-full bg-gray-100" />
      <div className="mb-2 h-5 w-3/4 rounded bg-gray-100" />
      <div className="space-y-1.5">
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
      </div>
      <div className="mt-3 flex gap-3">
        <div className="h-3.5 w-20 rounded bg-gray-100" />
        <div className="h-3.5 w-24 rounded bg-gray-100" />
      </div>
    </div>
  )
}

function ContentCard({ item }: { item: ContentItem }) {
  const catStyle =
    CATEGORY_STYLE[item.category] ?? 'bg-gray-50 text-gray-600 border-gray-100'
  const dateStr = formatDate(item.published_at)
  const isYoutube = item.category === '유튜브'

  const innerContent = (
    <div className="min-w-0 flex-1">
      {/* 뱃지 */}
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

      {/* 제목 */}
      <h2 className="mb-1.5 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover:text-brand-600">
        {item.title}
      </h2>

      {/* 요약 */}
      {item.summary_ko && (
        <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
          {item.summary_ko}
        </p>
      )}

      {/* 메타 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-400">
        {item.sources?.name && (
          <span className="font-medium text-gray-500">{item.sources.name}</span>
        )}
        {item.author && !item.sources?.name && <span>{item.author}</span>}
        {dateStr && <span>{dateStr}</span>}
      </div>
    </div>
  )

  return (
    <article className="group rounded-xl border border-gray-100 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        {isYoutube ? (
          innerContent
        ) : (
          <Link href={`/dashboard/contents/${item.id}`} className="min-w-0 flex-1">
            {innerContent}
          </Link>
        )}

        {/* 액션 버튼 */}
        <div className="shrink-0 pt-0.5">
          {item.original_url ? (
            <a
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              원문
            </a>
          ) : item.file_path ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500">
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
  // svc/src 는 UUID (sidebar의 ?service=mockId 와 별도 파라미터 사용)
  const category = (searchParams.get('category') ?? '') as ContentCategory | ''
  const date     = (searchParams.get('date') ?? 'all') as DateFilter
  const svc      = searchParams.get('svc') ?? ''      // service UUID
  const src      = searchParams.get('src') ?? ''      // source UUID
  const kw       = searchParams.get('kw') ?? ''       // keyword text
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  // ── 상태 ─────────────────────────────────────────────────────────────────────
  const [items, setItems]         = useState<ContentItem[]>([])
  const [total, setTotal]         = useState<number | null>(null)
  const [isLoading, setLoading]   = useState(false)
  const [services, setServices]   = useState<DropdownOption[]>([])
  const [sources, setSources]     = useState<DropdownOption[]>([])
  const [kwInput, setKwInput]     = useState(kw)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── URL 업데이트 헬퍼 (필터 바뀌면 page 초기화) ──────────────────────────────
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
      if (svcs) setServices(svcs as DropdownOption[])
      if (srcs) setSources(srcs as DropdownOption[])
    })
  }, [])

  // ── 콘텐츠 쿼리 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchContents = async () => {
      setLoading(true)
      const supabase = createClient()

      // ① 서비스 필터: content_ids 구하기
      let svcContentIds: string[] | null = null
      if (svc) {
        const { data } = await supabase
          .from('content_services')
          .select('content_id')
          .eq('service_id', svc)
        svcContentIds = data?.map((r) => r.content_id) ?? []
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

      // early return — 서비스 또는 키워드 조건에 해당하는 콘텐츠 없음
      if (svcContentIds?.length === 0 || kwContentIds?.length === 0) {
        if (!cancelled) {
          if (page === 1) setItems([])
          setTotal(0)
          setLoading(false)
        }
        return
      }

      // ③ 메인 쿼리
      let q = supabase
        .from('contents')
        .select(
          'id, title, summary_ko, category, published_at, file_path, original_url, is_editor_pick, author, sources(name)',
          { count: 'exact' }
        )
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (category) q = q.eq('category', category)
      if (src)      q = q.eq('source_id', src)

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
  }, [category, date, svc, src, kw, page])

  // ── 더 보기 ──────────────────────────────────────────────────────────────────
  const handleLoadMore = () => updateParam('page', String(page + 1))
  const hasMore = total !== null && items.length < total

  // ── 활성 필터 chip 목록 ──────────────────────────────────────────────────────
  const activeFilters: { key: string; label: string; reset?: () => void }[] = []
  if (category) activeFilters.push({
    key: 'category',
    label: `카테고리: ${CONTENT_CATEGORY_LABEL[category] ?? category}`,
  })
  if (date !== 'all') activeFilters.push({
    key: 'date',
    label: DATE_OPTIONS.find((d) => d.value === date)?.label ?? date,
  })
  if (svc) {
    const svcName = services.find((s) => s.id === svc)?.name ?? '서비스'
    activeFilters.push({ key: 'svc', label: `서비스: ${svcName}` })
  }
  if (src) {
    const srcName = sources.find((s) => s.id === src)?.name ?? '출처'
    activeFilters.push({ key: 'src', label: `출처: ${srcName}` })
  }
  if (kw) activeFilters.push({
    key: 'kw',
    label: `키워드: ${kw}`,
    reset: () => setKwInput(''),
  })

  // ── 페이지 제목 ──────────────────────────────────────────────────────────────
  const pageTitle = category
    ? (CONTENT_CATEGORY_LABEL[category] ?? category)
    : '전체 콘텐츠'

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* 브레드크럼 */}
      <div className="mb-5 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">
          대시보드
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">{pageTitle}</span>
      </div>

      {/* 제목 + 건수 */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>
        {!isLoading && total !== null && (
          <p className="mt-0.5 text-xs text-gray-400">
            {total > 0 ? `총 ${total.toLocaleString()}건` : ''}
          </p>
        )}
      </div>

      {/* ─── 필터 바 ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-xl border border-gray-100 bg-white px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">

          {/* 날짜 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-gray-400">날짜</span>
            <div className="flex gap-1">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    updateParam('date', opt.value === 'all' ? '' : opt.value)
                  }
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    date === opt.value || (opt.value === 'all' && !searchParams.get('date'))
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* 서비스 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-gray-400">서비스</span>
            <select
              value={svc}
              onChange={(e) => updateParam('svc', e.target.value)}
              className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-gray-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:text-gray-400"
              disabled={services.length === 0}
            >
              <option value="">전체</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon ? `${s.icon} ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 출처 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-gray-400">출처</span>
            <select
              value={src}
              onChange={(e) => updateParam('src', e.target.value)}
              className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-gray-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:text-gray-400"
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

          {/* 키워드 */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-gray-400">키워드</span>
            <div className="relative">
              <input
                type="text"
                value={kwInput}
                onChange={(e) => handleKwChange(e.target.value)}
                placeholder="예: AI 에이전트"
                className="w-32 rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-gray-700 placeholder-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100"
              />
              {kwInput && (
                <button
                  onClick={() => { setKwInput(''); updateParam('kw', '') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="키워드 지우기"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 활성 필터 chips */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-3">
            <span className="text-[11px] text-gray-400">적용 중:</span>
            {activeFilters.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                onRemove={() => {
                  f.reset?.()
                  updateParam(f.key, '')
                }}
              />
            ))}
            <button
              onClick={() => {
                setKwInput('')
                router.push(pathname)
              }}
              className="text-[11px] text-gray-400 underline hover:text-gray-600"
            >
              전체 초기화
            </button>
          </div>
        )}
      </div>

      {/* ─── 콘텐츠 목록 ──────────────────────────────────────────────────────── */}
      {isLoading && page === 1 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white py-24 text-center">
          <span className="text-4xl">📭</span>
          <p className="text-sm font-medium text-gray-700">해당하는 콘텐츠가 없습니다</p>
          <p className="text-xs text-gray-400">필터 조건을 변경해보세요</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>

          {/* 더 보기 */}
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-brand-600 hover:text-brand-600 disabled:opacity-50"
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
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">로딩 중...</div>}>
      <ContentsContent />
    </Suspense>
  )
}
