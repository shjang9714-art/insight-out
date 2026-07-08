'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface InsightViewTabItem<T extends string> {
  id: T
  label: string
  /** 라벨 우측 작은 카운트(선택). 1000+ 는 Xk 축약. */
  count?: number
  /** 있으면 <Link>로 렌더(라우팅형 탭). 없으면 <button onClick={onChange}>. */
  href?: string
}

interface InsightViewTabsProps<T extends string> {
  items: InsightViewTabItem<T>[]
  value: T
  onChange?: (id: T) => void
  className?: string
}

function formatCount(count: number): string {
  return count >= 1000 ? `${Math.floor(count / 1000)}k` : String(count)
}

/**
 * 지속형·좌측·언더라인 탭(227). 어드민 AdminTabs(세그먼트 박스)와 계열을 분리해
 * 사용자단은 저대비 언더라인으로 — 테두리·틴트·pill 없음.
 * href 있으면 라우팅형(Link), 없으면 상태형(button onChange). count는 라벨 우측 보조 숫자(228).
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
        const cls = cn(
          'relative flex items-center gap-1.5 py-2 text-[14px] transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:transition-colors',
          active
            ? 'font-medium text-foreground after:bg-brand-muted'
            : 'text-muted-foreground after:bg-transparent hover:text-foreground'
        )
        const content = (
          <>
            {item.label}
            {item.count !== undefined && (
              <span className={cn(
                'text-[11px] tabular-nums',
                active ? 'text-brand-muted' : 'text-muted-foreground',
                item.count === 0 && 'opacity-50',
              )}>
                {formatCount(item.count)}
              </span>
            )}
          </>
        )

        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className={cls}>
              {content}
            </Link>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            className={cls}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
