'use client'

import { cn } from '@/lib/utils'

export interface ServiceSelectionItem {
  id: string
  name: string
  description?: string | null
  icon?: string | null
}

interface Props {
  items: ServiceSelectionItem[]
  selectedIds: string[]
  onChange: (nextIds: string[]) => void
  emptyLabel?: string
  compact?: boolean
}

export default function ServiceSelectionGrid({
  items,
  selectedIds,
  onChange,
  emptyLabel = '등록된 서비스가 없습니다.',
  compact = false,
}: Props) {
  const selected = new Set(selectedIds)

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(Array.from(next))
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2', !compact && 'sm:grid-cols-3')}>
      {items.map((item) => {
        const isSelected = selected.has(item.id)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            title={item.description ?? undefined}
            className={cn(
              'flex min-h-12 flex-col justify-center gap-0.5 rounded-lg border text-left transition-all',
              compact ? 'px-3 py-2' : 'p-3',
              isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-border bg-card text-foreground hover:border-border hover:bg-accent'
            )}
          >
            {item.icon && <span className={cn('leading-none', compact ? 'text-sm' : 'text-base')}>{item.icon}</span>}
            <span className="text-sm font-medium leading-tight">{item.name}</span>
          </button>
        )
      })}
    </div>
  )
}
