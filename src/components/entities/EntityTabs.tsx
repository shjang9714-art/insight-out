'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'watchlist',  label: '관심기업' },
  { id: 'competitor', label: '경쟁사' },
  { id: 'briefing',   label: '브리핑' },
  { id: 'graph',      label: '관계지도' },
]

export default function EntityTabs() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'watchlist'

  return (
    <div className="mb-6 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/dashboard/entities?view=${t.id}`}
          className={cn(
            'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
            view === t.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
