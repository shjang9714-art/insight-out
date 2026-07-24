'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { isSearchFilterKey, type SearchFilterKey } from '@/lib/search/search-filters'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import SearchResultsList from '@/components/search/SearchResultsList'
import { useUnifiedSearch } from '@/lib/search/use-unified-search'

const MAX_RESULTS = 60

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

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

// ─── 검색 컨텐츠 ──────────────────────────────────────────────────────────────

function SearchContent() {
  const searchParams = useSearchParams()

  const q = searchParams.get('q')?.trim() ?? ''
  const rawFilter = searchParams.get('filter')
  const filter: SearchFilterKey | '' = isSearchFilterKey(rawFilter) ? rawFilter : ''

  const { results, isLoading, error } = useUnifiedSearch(q, filter)

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

      {/* 헤더 */}
      <div className="mb-5 flex items-start gap-3">
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

      {/* 추천 질문 칩 — q 없을 때만 */}
      {!q && <SuggestedQuestions className="mb-6" />}

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
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
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

      {/* 결과 목록 */}
      {q && !isLoading && results !== null && results.length > 0 && <SearchResultsList results={results} />}
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
