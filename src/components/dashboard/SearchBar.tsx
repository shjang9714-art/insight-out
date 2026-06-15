'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_DEFS } from '@/lib/categories'
import type { ContentCategory } from '@/lib/types'

interface Props {
  onClose?: () => void
}

export default function SearchBar({ onClose }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = (searchParams.get('category') ?? '') as ContentCategory | ''

  const [searchQuery, setSearchQuery]   = useState('')
  // null = 명시 선택 없음 → currentCategory(URL 맥락) 사용
  const [scopeOverride, setScopeOverride] = useState<ContentCategory | '' | null>(null)
  const [scopeOpen, setScopeOpen]         = useState(false)
  const scopeRef    = useRef<HTMLDivElement>(null)
  const scopeBtnRef = useRef<HTMLButtonElement>(null)

  // 명시 선택 > URL 맥락 우선순위
  const scopeSelection = scopeOverride !== null ? scopeOverride : currentCategory

  // 바깥 클릭 시 스코프 메뉴 닫기
  useEffect(() => {
    if (!scopeOpen) return
    const handler = (e: MouseEvent) => {
      if (
        scopeRef.current    && !scopeRef.current.contains(e.target as Node) &&
        scopeBtnRef.current && !scopeBtnRef.current.contains(e.target as Node)
      ) setScopeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [scopeOpen])

  // ESC 닫기
  useEffect(() => {
    if (!scopeOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setScopeOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [scopeOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '/') {
      const input = e.currentTarget
      if (searchQuery === '' || input.selectionStart === 0) {
        e.preventDefault()
        setScopeOpen(true)
      }
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    const p = new URLSearchParams()
    p.set('q', q)
    if (scopeSelection) p.set('category', scopeSelection)
    router.push(`/dashboard/search?${p.toString()}`)
    onClose?.()
  }

  const scopeLabel = scopeSelection
    ? (CATEGORY_DEFS.find((d) => d.category === scopeSelection)?.label ?? scopeSelection)
    : '전체'

  return (
    <form onSubmit={handleSearch} className="w-full">
      <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-muted focus-within:border-brand-600 focus-within:bg-background focus-within:ring-2 focus-within:ring-brand-100">

        {/* 스코프 칩 */}
        <div className="relative shrink-0">
          <button
            ref={scopeBtnRef}
            type="button"
            onClick={() => setScopeOpen((v) => !v)}
            className={cn(
              'flex h-full items-center gap-1 border-r border-border/60 px-2.5 text-[11px] font-medium transition-colors',
              scopeSelection
                ? 'text-brand-700 dark:text-brand-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="max-w-[56px] truncate">{scopeLabel}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', scopeOpen && 'rotate-180')} />
          </button>

          {/* 스코프 드롭다운 */}
          {scopeOpen && (
            <div
              ref={scopeRef}
              className="absolute left-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            >
              {/* 전체 */}
              <button
                type="button"
                onClick={() => { setScopeOverride(''); setScopeOpen(false) }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-accent',
                  !scopeSelection && 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400'
                )}
              >
                전체
              </button>
              {CATEGORY_DEFS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => { setScopeOverride(def.category); setScopeOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                    scopeSelection === def.category && 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-400'
                  )}
                >
                  <def.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{def.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 검색 input */}
        <div className="relative flex-1">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="콘텐츠 검색 — '/' 로 영역 선택"
            className="w-full bg-transparent py-2.5 pl-8 pr-8 text-sm text-foreground placeholder-muted-foreground outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="검색어 지우기"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
