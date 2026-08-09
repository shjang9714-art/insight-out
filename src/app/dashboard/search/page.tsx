'use client'

import { Suspense, useEffect, useState, startTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import RecentSearchesPanel from '@/components/search/RecentSearchesPanel'
import SearchResultsPanel from '@/components/search/SearchResultsPanel'
import AiSearchAnswer from '@/components/search/AiSearchAnswer'
import type { SearchSortMode } from '@/components/search/SearchTypeTabs'
import { isSearchFilterKey, type SearchFilterKey } from '@/lib/search/search-filters'
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '@/lib/search/recent-searches'

function isSortMode(v: string | null): v is SearchSortMode {
  return v === 'relevance' || v === 'latest'
}

// ─── 검색 컨텐츠 ──────────────────────────────────────────────────────────────

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const q = searchParams.get('q')?.trim() ?? ''
  const rawType = searchParams.get('type')
  const activeType: SearchFilterKey | 'all' = rawType === 'all' || isSearchFilterKey(rawType) ? (rawType as SearchFilterKey | 'all') : 'all'
  const sortMode: SearchSortMode = isSortMode(searchParams.get('sort')) ? (searchParams.get('sort') as SearchSortMode) : 'relevance'

  const [liveInput, setLiveInput] = useState(q)
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => { startTransition(() => setRecent(getRecentSearches())) }, [])
  // q가 바깥(뒤로가기·팝업에서 이동 등)에서 바뀌면 입력창도 맞춰준다
  useEffect(() => { startTransition(() => setLiveInput(q)) }, [q])

  // 종류/정렬은 URL 쿼리(type/sort)에 반영해 새로고침·뒤로가기에도 유지되게 한다.
  // 기본값(전체/관련도순)일 땐 쿼리에서 지워 URL을 깔끔하게 유지.
  const updateParams = (next: { q?: string; type?: SearchFilterKey | 'all'; sort?: SearchSortMode }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.q !== undefined) {
      if (next.q) params.set('q', next.q); else params.delete('q')
    }
    if (next.type !== undefined) {
      if (next.type === 'all') params.delete('type'); else params.set('type', next.type)
    }
    if (next.sort !== undefined) {
      if (next.sort === 'relevance') params.delete('sort'); else params.set('sort', next.sort)
    }
    router.replace(`/dashboard/search?${params.toString()}`)
  }

  const runSearch = (nextQ: string) => {
    const trimmed = nextQ.trim()
    if (!trimmed) return
    setRecent(addRecentSearch(trimmed))
    // 새 검색어는 종류/정렬을 기본값(전체/관련도순)으로 리셋
    updateParams({ q: trimmed, type: 'all', sort: 'relevance' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runSearch(liveInput)
  }

  const handleRemoveRecent = (v: string) => setRecent(removeRecentSearch(v))
  const handleClearRecent = () => setRecent(clearRecentSearches())

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

      {/* 검색 입력창 — 여기서 검색어를 고쳐 엔터 치면 페이지 이동 없이 q만 갱신되며 재검색 */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            placeholder="콘텐츠 검색"
            className="w-full rounded-lg border border-border bg-muted py-3 pl-10 pr-10 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-brand-600 focus:bg-background focus:ring-2 focus:ring-brand-100"
          />
          {liveInput && (
            <button
              type="button"
              onClick={() => setLiveInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="검색어 지우기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {/* 검색어 없음 — 최근 검색어 + 추천 질문 */}
      {!q && (
        <>
          <RecentSearchesPanel
            items={recent}
            onSelect={runSearch}
            onRemove={handleRemoveRecent}
            onClearAll={handleClearRecent}
            className="mb-6"
          />
          <SuggestedQuestions className="mb-6" onSelect={runSearch} />
          {recent.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
            </div>
          )}
        </>
      )}

      {/* AI 답변 — 활성화된 경우 검색 결과보다 먼저 자동 노출 */}
      {q && <AiSearchAnswer key={q} question={q} />}

      {/* 결과 — 종류 버튼줄+건수, 정렬 토글, 하이라이트, 빈 상태(SearchResultsPanel, 팝업과 공유) */}
      {q && (
        <SearchResultsPanel
          q={q}
          activeType={activeType}
          onTypeChange={(key) => updateParams({ type: key })}
          sortMode={sortMode}
          onSortChange={(mode) => updateParams({ sort: mode })}
          stickyTopClassName="top-14 md:top-24 bg-background"
          emptyStateExtra={
            <RecentSearchesPanel
              items={recent}
              onSelect={runSearch}
              onRemove={handleRemoveRecent}
              onClearAll={handleClearRecent}
              className="mt-6 w-full text-left"
            />
          }
        />
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
