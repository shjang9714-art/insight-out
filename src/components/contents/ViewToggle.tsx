'use client'

import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ContentsView = 'card' | 'list'

interface ViewToggleProps {
  value: ContentsView
  onChange: (view: ContentsView) => void
  groupAriaLabel?: string
  /** icon: 아이콘 전용(shadcn Button, ContentsBoard 기본) / labeled: 아이콘+텍스트(InsightCardsSectionClient) */
  variant?: 'icon' | 'labeled'
  className?: string
}

export default function ViewToggle({
  value,
  onChange,
  groupAriaLabel = '보기 방식',
  variant = 'icon',
  className,
}: ViewToggleProps) {
  if (variant === 'labeled') {
    return (
      <div
        role="group"
        aria-label={groupAriaLabel}
        className={cn('inline-flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5', className)}
      >
        <button
          type="button"
          onClick={() => onChange('card')}
          aria-label="카드 보기"
          aria-pressed={value === 'card'}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === 'card' ? 'bg-brand-solid text-white' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          카드
        </button>
        <button
          type="button"
          onClick={() => onChange('list')}
          aria-label="목록 보기"
          aria-pressed={value === 'list'}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === 'list' ? 'bg-brand-solid text-white' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="h-3.5 w-3.5" />
          목록
        </button>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label={groupAriaLabel}
      className={cn('flex items-center rounded-lg border border-border bg-card p-0.5', className)}
    >
      <Button
        type="button"
        variant={value === 'card' ? 'secondary' : 'ghost'}
        size="icon-sm"
        onClick={() => onChange('card')}
        aria-label="카드 보기"
        aria-pressed={value === 'card'}
        title="카드 보기"
      >
        <LayoutGrid aria-hidden />
      </Button>
      <Button
        type="button"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        size="icon-sm"
        onClick={() => onChange('list')}
        aria-label="리스트 보기"
        aria-pressed={value === 'list'}
        title="리스트 보기"
      >
        <List aria-hidden />
      </Button>
    </div>
  )
}
