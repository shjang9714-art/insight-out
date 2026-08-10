'use client'

import { useEffect, useRef, useState, startTransition } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowLeft, Search, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import RecentSearchesPanel from '@/components/search/RecentSearchesPanel'
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '@/lib/search/recent-searches'

/** 통합검색 팝업 — "입구"로만 동작(2026-08-09b 후속 개편). 검색 실행(엔터/최근검색어
 * 클릭/추천칩 클릭) 시 최근 검색어에 저장 후 팝업을 닫고 /dashboard/search?q=...로
 * 이동한다 — 결과 목록·종류 버튼줄·정렬 토글·스켈레톤은 전부 그 전체 페이지가 그린다
 * (SearchResultsPanel, src/app/dashboard/search/page.tsx). 팝업 안에서는 더 이상
 * useUnifiedSearch를 호출하지 않는다. */
export default function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const previousPathname = useRef(pathname)
  const inputRef = useRef<HTMLInputElement>(null)

  const [liveInput, setLiveInput] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  // 라우트 이동 시 자동 닫힘(기존 동작 유지) — runSearch가 이미 닫지만, 뒤로가기 등
  // 다른 경로로 pathname이 바뀌는 경우까지 아우르는 안전판.
  useEffect(() => {
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname
      if (open) onOpenChange(false)
    }
  }, [pathname, open, onOpenChange])

  // 열릴 때마다 입력 초기화 + 최근 검색어 로드, 입력창 포커스
  useEffect(() => {
    if (!open) return
    startTransition(() => {
      setLiveInput('')
      setRecent(getRecentSearches())
    })
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const runSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    addRecentSearch(trimmed)
    onOpenChange(false)
    router.push(`/dashboard/search?q=${encodeURIComponent(trimmed)}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runSearch(liveInput)
  }

  const handleRemoveRecent = (q: string) => setRecent(removeRecentSearch(q))
  const handleClearRecent = () => setRecent(clearRecentSearches())

  const hasTyped = liveInput.trim().length > 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4 md:inset-x-0 md:top-[7vh] md:mx-auto md:h-auto md:max-h-[82vh] md:w-full md:max-w-2xl md:rounded-2xl md:border md:border-border md:pt-0 md:shadow-2xl"
        >
          <DialogPrimitive.Title className="sr-only">통합검색</DialogPrimitive.Title>

          {/* 헤더: 닫기 + 입력창 */}
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
                  onClick={() => setLiveInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* 입력이 비어있을 때만 최근 검색어를 보여준다(추천 질문 칩은 후속 개편 2026-08-10에서
              제거) — 결과 목록은 여기서 안 그림 */}
          {!hasTyped && (
            <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 md:rounded-b-2xl">
              <RecentSearchesPanel
                items={recent}
                onSelect={runSearch}
                onRemove={handleRemoveRecent}
                onClearAll={handleClearRecent}
                className="mb-6"
              />
              {recent.length === 0 && (
                <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
                </div>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
