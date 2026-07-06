'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'watchlist',  label: '관심기업' },
  { id: 'competitor', label: '경쟁사' },
  { id: 'briefing',   label: '브리핑' },
]

export default function EntityTabs() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'watchlist'

  return (
    <div className="mb-6 flex gap-2">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/dashboard/entities?view=${t.id}`}
          className={cn(
            'flex-1 rounded-xl border px-3 py-3.5 text-center text-base font-semibold transition-colors',
            view === t.id
              ? 'border-brand-600 bg-brand-600/10 text-brand-600'
              : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
