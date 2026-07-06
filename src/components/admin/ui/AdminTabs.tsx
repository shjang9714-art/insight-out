import { cn } from '@/lib/utils'

export interface AdminTabItem {
  value: string
  label: string
  count?: number
  disabled?: boolean
}

interface Props {
  items: AdminTabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
  'aria-label'?: string
}

/** 어드민 레벨2 인페이지 탭 공통 컴포넌트 — 세그먼트 박스(회색 라운드 박스 안 버튼, 활성 brand). 순수 표시, 상태는 부모가 관리(209). */
export default function AdminTabs({ items, value, onChange, className, 'aria-label': ariaLabel }: Props) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted p-1', className)}
    >
      {items.map((it) => {
        const active = value === it.value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={it.disabled}
            onClick={() => !it.disabled && onChange(it.value)}
            className={cn(
              'admin-btn-text h-9 rounded-md px-3.5 transition-colors',
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : it.disabled
                  ? 'cursor-default text-text-disabled'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {it.label}
            {typeof it.count === 'number' && (
              <span className="ml-1.5 tabular-nums opacity-70">{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
