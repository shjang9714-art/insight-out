'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 공용 헬퍼 (contents·search 페이지에서도 import) ──────────────────────────

export interface SourceItem {
  id: string
  name: string
  group_name?: string | null
}

export interface SourceGroup {
  label: string
  ids: string[]
}

export function groupSources(sources: SourceItem[]): SourceGroup[] {
  const map = new Map<string, SourceGroup>()
  for (const s of sources) {
    const label = s.group_name ?? s.name
    if (!map.has(label)) map.set(label, { label, ids: [] })
    map.get(label)!.ids.push(s.id)
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}

/** value 에 멤버가 모두 포함된 그룹만 반환 (활성칩 도출용) */
export function selectedGroups(value: string[], sources: SourceItem[]): SourceGroup[] {
  return groupSources(sources).filter((g) => g.ids.every((id) => value.includes(id)))
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface SourcePopoverProps {
  sources: SourceItem[]
  value: string[]
  onChange: (ids: string[]) => void
}

export default function SourcePopover({ sources, value, onChange }: SourcePopoverProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  const groups   = groupSources(sources)
  const filtered = groups.filter((g) =>
    g.label.toLowerCase().includes(query.toLowerCase())
  )
  const selectedGroupCount = groups.filter((g) => g.ids.every((id) => value.includes(id))).length

  const close = () => { setOpen(false); setQuery('') }

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const toggleGroup = (grp: SourceGroup) => {
    const allSelected = grp.ids.every((id) => value.includes(id))
    if (allSelected) {
      onChange(value.filter((id) => !grp.ids.includes(id)))
    } else {
      onChange([...new Set([...value, ...grp.ids])])
    }
  }

  const hasSelection = value.length > 0

  if (sources.length === 0) return null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
          hasSelection
            ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400'
            : 'border-border bg-card text-muted-foreground hover:border-brand-200 hover:text-foreground'
        )}
      >
        출처
        {selectedGroupCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {selectedGroupCount}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {/* 검색 input */}
          <div className="flex items-center border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="출처 검색..."
              autoFocus
              className="ml-2 w-full bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none"
            />
          </div>

          {/* 전체 해제 */}
          <div className="border-b border-border px-3 py-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className={cn(
                'text-[11px] transition-colors',
                hasSelection ? 'text-brand-600 hover:text-brand-700' : 'text-muted-foreground cursor-default'
              )}
              disabled={!hasSelection}
            >
              전체 해제
            </button>
          </div>

          {/* 그룹 목록 */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">검색 결과 없음</p>
            ) : (
              filtered.map((grp) => {
                const selected = grp.ids.every((id) => value.includes(id))
                return (
                  <button
                    key={grp.label}
                    type="button"
                    onClick={() => toggleGroup(grp)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                      selected && 'bg-brand-50/50 dark:bg-brand-950/20'
                    )}
                  >
                    <span className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      selected
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-border bg-background'
                    )}>
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={cn(
                      'flex-1 truncate',
                      selected && 'font-medium text-brand-700 dark:text-brand-400'
                    )}>
                      {grp.label}
                    </span>
                    {grp.ids.length > 1 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        ({grp.ids.length})
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
