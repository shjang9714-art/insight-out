'use client'

import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowLeft, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import RecentSearchesPanel from '@/components/search/RecentSearchesPanel'
import SearchTypeTabs, { type SearchSortMode, type SearchTypeOption } from '@/components/search/SearchTypeTabs'
import { renderSearchResultItem } from '@/components/search/SearchResultsList'
import { useUnifiedSearch, type UnifiedResult } from '@/lib/search/use-unified-search'
import { SEARCH_FILTER_DEFS, type SearchFilterKey } from '@/lib/search/search-filters'
import { useDebouncedValue } from '@/lib/search/use-debounced-value'
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '@/lib/search/recent-searches'

const DEBOUNCE_MS = 280

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-border bg-card px-5 py-4">
          <div className="mb-2 h-4 w-14 rounded-md bg-muted" />
          <div className="mb-1.5 h-4 w-3/4 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function labelFor(key: SearchFilterKey): string {
  return SEARCH_FILTER_DEFS.find((d) => d.key === key)?.label ?? key
}

export default function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const previousPathname = useRef(pathname)
  const inputRef = useRef<HTMLInputElement>(null)

  const [liveInput, setLiveInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [activeType, setActiveType] = useState<SearchFilterKey | 'all'>('all')
  const [sortMode, setSortMode] = useState<SearchSortMode>('relevance')
  const [recent, setRecent] = useState<string[]>([])

  const debouncedInput = useDebouncedValue(liveInput, DEBOUNCE_MS)

  // 검색 전 종류 선택 폐지(B 스펙) — filter는 항상 ''로 호출해 전 종류를 함께 조회하고,
  // 종류 버튼은 이미 받아온 결과를 종류별로 client-side에서 나눠 보여줄 뿐이다.
  const { sections, isLoading, error } = useUnifiedSearch(activeQuery, '')

  // 라우트 이동 시 자동 닫힘(기존 동작 유지)
  useEffect(() => {
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname
      if (open) onOpenChange(false)
    }
  }, [pathname, open, onOpenChange])

  // 열릴 때마다 상태 초기화 + 최근 검색어 로드, 입력창 포커스
  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setLiveInput('')
      setActiveQuery('')
      setActiveType('all')
      setRecent(getRecentSearches())
    })
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // 입력 중 자동 검색 — 디바운스 값이 갱신되면 실제 조회에 반영(D 스펙)
  useEffect(() => {
    startTransition(() => setActiveQuery(debouncedInput.trim()))
  }, [debouncedInput])

  // 선택한 종류가 결과에서 사라지면(재검색 등) '전체'로 안전하게 되돌림
  useEffect(() => {
    if (activeType === 'all') return
    if (!sections?.some((s) => s.key === activeType)) startTransition(() => setActiveType('all'))
  }, [sections, activeType])

  const runSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLiveInput(trimmed)
    setActiveQuery(trimmed)
    setActiveType('all')
    setRecent(addRecentSearch(trimmed))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runSearch(liveInput)
  }

  const handleRemoveRecent = (q: string) => setRecent(removeRecentSearch(q))
  const handleClearRecent = () => setRecent(clearRecentSearches())

  const totalCount = sections?.reduce((sum, s) => sum + s.items.length, 0) ?? 0

  const typeOptions: SearchTypeOption[] = useMemo(() => {
    if (!sections) return []
    return [
      { key: 'all', label: '전체', count: totalCount },
      ...sections.map((s) => ({ key: s.key, label: labelFor(s.key), count: s.items.length })),
    ]
  }, [sections, totalCount])

  const visibleItems: UnifiedResult[] = useMemo(() => {
    if (!sections) return []
    // '전체' = 종류별로 이미 고정 순서(SEARCH_SECTION_ORDER)로 온 sections를 그대로 이어붙임 —
    // 이게 "관련도순(기존 검색 랭킹)" 기본값이다. 특정 종류 선택 시 그 섹션만.
    const base = activeType === 'all'
      ? sections.flatMap((s) => s.items)
      : (sections.find((s) => s.key === activeType)?.items ?? [])
    if (sortMode === 'relevance') return base
    return [...base].sort((a, b) => b.sortDate.localeCompare(a.sortDate))
  }, [sections, activeType, sortMode])

  // 타이핑을 시작하면(디바운스 완료 전이라도) 최근 검색어 패널을 감추고 결과 영역으로 전환
  const hasTyped = liveInput.trim().length > 0
  const queryPending = hasTyped && liveInput.trim() !== activeQuery
  const showSkeleton = hasTyped && (queryPending || isLoading)
  const showResults = hasTyped && !showSkeleton && sections !== null && !error
  const showEmpty = showResults && totalCount === 0
  const showRecentOrSuggested = !hasTyped

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4 md:inset-x-0 md:top-[7vh] md:mx-auto md:h-auto md:max-h-[82vh] md:w-full md:max-w-2xl md:rounded-2xl md:border md:border-border md:pt-0 md:shadow-2xl"
        >
          <DialogPrimitive.Title className="sr-only">통합검색</DialogPrimitive.Title>

          {/* 헤더: 닫기 + 입력창 (데스크톱/모바일 공용, 필터 드롭다운은 폐지) */}
          <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 md:rounded-t-2xl">
            <DialogPrimitive.Close asChild>
              <button type="button" className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" aria-label="검색 닫기">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </DialogPrimitive.Close>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={liveInput}
                onChange={(e) => setLiveInput(e.target.value)}
                placeholder="콘텐츠 검색"
                className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-9 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-brand-600 focus:bg-background focus:ring-2 focus:ring-brand-100"
              />
              {liveInput && (
                <button
                  type="button"
                  onClick={() => { setLiveInput(''); setActiveQuery('') }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* 스크롤 영역 — 종류 버튼 줄 + 정렬 토글은 sticky로 상단 고정 */}
          <div className="flex-1 overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-b-2xl">
            {showRecentOrSuggested && (
              <div className="px-4 py-5 sm:px-6">
                <RecentSearchesPanel
                  items={recent}
                  onSelect={runSearch}
                  onRemove={handleRemoveRecent}
                  onClearAll={handleClearRecent}
                  className="mb-6"
                />
                <SuggestedQuestions onSelect={runSearch} />
                {recent.length === 0 && (
                  <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
                  </div>
                )}
              </div>
            )}

            {hasTyped && sections !== null && sections.length > 0 && (
              <div className="sticky top-0 z-10">
                <SearchTypeTabs
                  types={typeOptions}
                  activeType={activeType}
                  onTypeChange={setActiveType}
                  sortMode={sortMode}
                  onSortChange={setSortMode}
                />
              </div>
            )}

            <div className="px-4 py-4 sm:px-6">
              {showSkeleton && <SearchSkeleton />}

              {hasTyped && !showSkeleton && error && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              {showEmpty && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-center">
                  <span className="text-3xl">🔍</span>
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-brand-600">&lsquo;{activeQuery}&rsquo;</span>에 대한 결과가 없어요
                  </p>
                  <p className="text-xs text-muted-foreground">철자를 확인하거나 다른 키워드로 다시 검색해보세요</p>
                  <RecentSearchesPanel
                    items={recent}
                    onSelect={runSearch}
                    onRemove={handleRemoveRecent}
                    onClearAll={handleClearRecent}
                    className="mt-6 w-full text-left"
                  />
                </div>
              )}

              {showResults && !showEmpty && (
                <div className="space-y-2">
                  {visibleItems.map((item) => renderSearchResultItem(item, activeQuery))}
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
