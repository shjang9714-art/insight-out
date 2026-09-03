'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { BulbScene } from '@/components/login/BulbScene'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import SearchTypeTabs, { type SearchSortMode, type SearchTypeOption } from '@/components/search/SearchTypeTabs'
import { renderSearchResultItem } from '@/components/search/SearchResultsList'
import { useUnifiedSearch, type UnifiedResult } from '@/lib/search/use-unified-search'
import { SEARCH_FILTER_DEFS, type SearchFilterKey } from '@/lib/search/search-filters'

function labelFor(key: SearchFilterKey): string {
  return SEARCH_FILTER_DEFS.find((d) => d.key === key)?.label ?? key
}

export function SearchResultsSkeleton() {
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

function SearchLoading({ onCancel }: { onCancel: () => void }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="relative flex min-h-64 max-h-80 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 opacity-15 blur-sm">
        <BulbScene />
      </div>
      <div className="relative z-10 m-auto flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-dashed border-brand-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">검색 중… {elapsedSeconds}초</p>
        {elapsedSeconds >= 5 && (
          <p className="mt-2 text-xs text-muted-foreground">검색 범위가 넓습니다. 잠시만 기다려주세요.</p>
        )}
        <Button type="button" variant="outline" size="sm" className="mt-5" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  )
}

interface Props {
  q: string
  activeType: SearchFilterKey | 'all'
  onTypeChange: (key: SearchFilterKey | 'all') => void
  sortMode: SearchSortMode
  onSortChange: (mode: SearchSortMode) => void
  /** 결과 0건일 때 안내 문구 아래 추가로 보여줄 것(최근 검색어 등) — 패널은 최근 검색어
   * 상태를 직접 들고 있지 않고 부모가 준다(호출부마다 최근 검색어 액션이 다를 수 있어서). */
  emptyStateExtra?: ReactNode
  /** sticky 종류버튼줄의 top 오프셋 — 팝업(다이얼로그 안, top-0)과 전체 페이지(사이트
   * 헤더 아래, top-14/md:top-24)가 다르다. 기본은 팝업 안 사용 기준인 'top-0'. */
  stickyTopClassName?: string
}

/** 검색 결과 UI(종류 버튼줄+건수, 정렬 토글, 하이라이트된 결과 카드, 빈 상태) — 통합검색
 * 후속 개편(2026-08-09b)에서 SearchOverlay 전용 인라인 코드였던 걸 분리했다. 팝업은 이제
 * "입구"로만 남고(검색 실행 시 /dashboard/search로 이동) 이 패널은 그 전체 페이지에서만
 * 렌더한다 — activeType/sortMode는 호출부(페이지)가 URL 쿼리와 동기화하려고 바깥에서
 * controlled로 들고 있다. */
export default function SearchResultsPanel({
  q, activeType, onTypeChange, sortMode, onSortChange, emptyStateExtra, stickyTopClassName = 'top-0',
}: Props) {
  const { sections, isLoading, error, notice, cancel } = useUnifiedSearch(q, '')

  // 선택한 종류가 결과에서 사라지면(재검색 등) '전체'로 안전하게 되돌림
  useEffect(() => {
    if (activeType === 'all') return
    if (!sections?.some((s) => s.key === activeType)) onTypeChange('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

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

  const showSkeleton = isLoading
  // 509 — 일부 소스 실패(error)여도 나머지 fulfilled 섹션은 그대로 보여준다.
  // "결과 없음"은 error 가 없을 때만 — 실패로 0건이 된 걸 "일치하는 결과가 없어요"로
  // 잘못 표시하면 안 된다(검색 실패와 결과 0건은 반드시 구분).
  const showResults = !showSkeleton && sections !== null
  const showEmpty = showResults && totalCount === 0 && !error

  return (
    <div>
      {!showSkeleton && sections !== null && sections.length > 0 && (
        <div className={cn('sticky z-10', stickyTopClassName)}>
          <SearchTypeTabs
            types={typeOptions}
            activeType={activeType}
            onTypeChange={onTypeChange}
            sortMode={sortMode}
            onSortChange={onSortChange}
          />
        </div>
      )}

      <div>
        {showSkeleton && <SearchLoading key={q} onCancel={cancel} />}

        {!showSkeleton && notice && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <p>{notice}</p>
            {sections === null && <p className="mt-1">다시 검색해보세요.</p>}
          </div>
        )}

        {!showSkeleton && error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {showEmpty && (
          <div className="rounded-2xl border border-border bg-card px-6 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  <span className="text-brand-600">&lsquo;{q}&rsquo;</span>과 일치하는 결과가 없어요
                </p>
                <p className="text-xs text-muted-foreground">
                  긴 문장보다 짧은 핵심 키워드로 검색하면 더 잘 찾아져요. 예: &lsquo;삼성전자&rsquo;, &lsquo;AI 규제&rsquo;
                </p>
              </div>
            </div>
            {emptyStateExtra && (
              <div className="mt-6 border-t border-border pt-5">
                {emptyStateExtra}
              </div>
            )}
          </div>
        )}

        {showResults && !showEmpty && (
          <div className="space-y-2">
            {visibleItems.map((item) => renderSearchResultItem(item, q))}
          </div>
        )}
      </div>
    </div>
  )
}
