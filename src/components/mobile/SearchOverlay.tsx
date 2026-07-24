'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowLeft, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'
import SearchBar from '@/components/dashboard/SearchBar'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'
import SearchResultsList from '@/components/search/SearchResultsList'
import { useUnifiedSearch } from '@/lib/search/use-unified-search'
import type { SearchFilterKey } from '@/lib/search/search-filters'

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

export default function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<SearchFilterKey | ''>('')
  const previousPathname = useRef(pathname)
  const { results, isLoading, error } = useUnifiedSearch(q, filter)

  useEffect(() => {
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname
      if (open) onOpenChange(false)
    }
  }, [pathname, open, onOpenChange])

  const submitSearch = (nextQ: string, nextFilter: SearchFilterKey | '') => {
    setQ(nextQ.trim())
    setFilter(nextFilter)
  }

  const selectQuestion = (nextQ: string) => {
    setQ(nextQ)
    setFilter('')
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)] md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4"
        >
          <DialogPrimitive.Title className="sr-only">모바일 검색</DialogPrimitive.Title>

          <header className="flex items-center gap-2 border-b border-border px-3 py-3">
            <DialogPrimitive.Close asChild>
              <button type="button" className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="검색 닫기">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </DialogPrimitive.Close>
            <SearchBar onSubmit={submitSearch} />
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {!q && <SuggestedQuestions className="mb-6" onSelect={selectQuestion} />}

            {!q && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
              </div>
            )}

            {q && isLoading && <SearchSkeleton />}
            {q && error && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {q && !isLoading && results !== null && results.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
                <span className="text-4xl">🔍</span>
                <p className="text-sm font-medium text-foreground"><span className="text-brand-600">&ldquo;{q}&rdquo;</span>에 대한 검색 결과가 없습니다</p>
                <p className="text-xs text-muted-foreground">다른 키워드로 다시 검색해보세요</p>
              </div>
            )}
            {q && !isLoading && results !== null && results.length > 0 && <SearchResultsList results={results} />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
