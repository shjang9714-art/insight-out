'use client'

import { Clock, X } from 'lucide-react'

interface Props {
  items: string[]
  onSelect: (q: string) => void
  onRemove: (q: string) => void
  onClearAll: () => void
  className?: string
}

/** 최근 검색어 목록(C 스펙) — localStorage 기반, 서버/DB 미사용. 클릭 시 즉시 재검색,
 * 개별 삭제(×)·전체 지우기 지원. 저장·삭제 로직은 lib/search/recent-searches.ts. */
export default function RecentSearchesPanel({ items, onSelect, onRemove, onClearAll, className }: Props) {
  if (items.length === 0) return null

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          최근 검색어
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-brand-600"
        >
          전체 지우기
        </button>
      </div>
      <ul className="space-y-0.5">
        {items.map((q) => (
          <li key={q} className="group flex items-center rounded-lg hover:bg-accent">
            <button
              type="button"
              onClick={() => onSelect(q)}
              className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm text-foreground"
            >
              {q}
            </button>
            <button
              type="button"
              onClick={() => onRemove(q)}
              aria-label={`'${q}' 삭제`}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
