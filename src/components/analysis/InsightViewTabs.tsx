'use client'

import { cn } from '@/lib/utils'

interface InsightViewTabItem<T extends string> {
  id: T
  label: string
}

interface InsightViewTabsProps<T extends string> {
  items: InsightViewTabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}

/**
 * 지속형·좌측·언더라인 탭(227). 어드민 AdminTabs(세그먼트 박스)와 계열을 분리해
 * 사용자단은 저대비 언더라인으로 — 테두리·틴트·pill 없음.
 */
export default function InsightViewTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: InsightViewTabsProps<T>) {
  return (
    <div className={cn('inline-flex items-center gap-5 border-b border-border', className)}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'relative py-2 text-[13px] transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:transition-colors',
              active
                ? 'font-medium text-foreground after:bg-brand-muted'
                : 'text-muted-foreground after:bg-transparent hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
