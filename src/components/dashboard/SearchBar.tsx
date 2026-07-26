'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEARCH_FILTER_DEFS, isSearchFilterKey, type SearchFilterKey } from '@/lib/search/search-filters'

interface Props {
  onClose?: () => void
  onSubmit?: (q: string, filter: SearchFilterKey | '') => void
}

export default function SearchBar({ onClose, onSubmit }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const rawFilter = searchParams.get('filter')
  const currentFilter: SearchFilterKey | '' = isSearchFilterKey(rawFilter) ? rawFilter : ''
  const currentQ = searchParams.get('q')?.trim() ?? ''

  const [searchQuery, setSearchQuery] = useState('')
  // null = 명시 선택 없음 → currentFilter(URL 맥락) 사용
  const [filterOverride, setFilterOverride] = useState<SearchFilterKey | '' | null>(null)
  const [filterOpen, setFilterOpen]         = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const filterRef    = useRef<HTMLDivElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)

  // 명시 선택 > URL 맥락 우선순위
  const filterSelection = filterOverride !== null ? filterOverride : currentFilter

  // 드롭다운은 검색 알약(overflow-hidden 래퍼) 밖 body 에 portal 로 띄운다 —
  // 안에서 absolute 로 두면 알약의 overflow-hidden 에 잘려 항목이 렌더는 되어도 안 보임(라이브 재현 확인).
  useLayoutEffect(() => {
    if (!filterOpen || !filterBtnRef.current) { setMenuPos(null); return }
    const updatePos = () => {
      const rect = filterBtnRef.current!.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [filterOpen])

  // 바깥 클릭 시 메뉴 닫기 (portal 로 body 에 떠 있으므로 filterRef 도 함께 확인)
  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (
        filterRef.current    && !filterRef.current.contains(e.target as Node) &&
        filterBtnRef.current && !filterBtnRef.current.contains(e.target as Node)
      ) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  // ESC 닫기
  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filterOpen])

  const navigateSearch = (q: string, filter: SearchFilterKey | '') => {
    if (!q) return
    const p = new URLSearchParams()
    p.set('q', q)
    if (filter) p.set('filter', filter)
    router.push(`/dashboard/search?${p.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (onSubmit) onSubmit(q, filterSelection)
    else navigateSearch(q, filterSelection)
    onClose?.()
  }

  // 카테고리 선택 즉시 반영 — 이미 검색 중(URL 또는 입력 중 검색어)이면 바로 재검색
  const handleFilterSelect = (filter: SearchFilterKey | '') => {
    setFilterOverride(filter)
    setFilterOpen(false)
    const q = currentQ || searchQuery.trim()
    if (q) {
      if (onSubmit) onSubmit(q, filter)
      else navigateSearch(q, filter)
    }
  }

  const filterLabel = filterSelection
    ? (SEARCH_FILTER_DEFS.find((d) => d.key === filterSelection)?.label ?? filterSelection)
    : '전체'

  return (
    <form onSubmit={handleSearch} className="w-full">
      <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-muted focus-within:border-brand-600 focus-within:bg-background focus-within:ring-2 focus-within:ring-brand-100">

        {/* 카테고리 필터 칩 */}
        <div className="relative shrink-0">
          <button
            ref={filterBtnRef}
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={cn(
              'flex h-full items-center gap-1 border-r border-border/60 px-2.5 text-[11px] font-medium transition-colors',
              filterSelection
                ? 'text-brand-700 dark:text-brand-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="max-w-[64px] truncate">{filterLabel}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', filterOpen && 'rotate-180')} />
          </button>

          {/* 카테고리 드롭다운 — body portal (검색 알약의 overflow-hidden 클리핑 회피) */}
          {filterOpen && menuPos && typeof document !== 'undefined' && createPortal(
            <div
              ref={filterRef}
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-50 w-36 max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card shadow-lg"
            >
              {/* 전체 */}
              <button
                type="button"
                onClick={() => handleFilterSelect('')}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-accent',
                  !filterSelection && 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400'
                )}
              >
                전체
              </button>
              {SEARCH_FILTER_DEFS.map((def) => (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => handleFilterSelect(def.key)}
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                    filterSelection === def.key && 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-400'
                  )}
                >
                  {def.label}
                </button>
              ))}
            </div>,
            document.body
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
            placeholder="콘텐츠 검색"
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
