'use client'

import { cn } from '@/lib/utils'
import type { SearchFilterKey } from '@/lib/search/search-filters'

export type SearchSortMode = 'relevance' | 'latest'

export interface SearchTypeOption {
  key: SearchFilterKey | 'all'
  label: string
  count: number
}

interface Props {
  types: SearchTypeOption[]
  activeType: SearchFilterKey | 'all'
  onTypeChange: (key: SearchFilterKey | 'all') => void
  sortMode: SearchSortMode
  onSortChange: (mode: SearchSortMode) => void
}

/** 결과 상단 "종류 버튼 줄" + 정렬 토글(B 스펙) — 오버레이 스크롤 시 sticky로 고정된다
 * (부모가 sticky top-0 컨테이너로 감싼다, SearchOverlay.tsx 참고). 버튼 칩 스타일은
 * DashboardHeader.tsx L2Row 모바일 칩과 동일한 톤(선택=브랜드색 채움, 나머지=테두리)을 재사용. */
export default function SearchTypeTabs({ types, activeType, onTypeChange, sortMode, onSortChange }: Props) {
  return (
    <div className="space-y-2.5 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {types.map((t) => {
          const active = t.key === activeType
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTypeChange(t.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'border border-border text-muted-foreground hover:border-brand-200 hover:text-foreground'
              )}
            >
              {t.label} {t.count}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => onSortChange('relevance')}
          className={cn(
            'rounded-md px-2 py-1 font-medium transition-colors',
            sortMode === 'relevance' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          관련도순
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={() => onSortChange('latest')}
          className={cn(
            'rounded-md px-2 py-1 font-medium transition-colors',
            sortMode === 'latest' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          최신순
        </button>
      </div>
    </div>
  )
}
