'use client'

import { useActiveLens, type LensKey } from '@/lib/lens'
import { cn } from '@/lib/utils'

const OPTS: { key: LensKey; label: string }[] = [
  { key: 'all',   label: '전체' },
  { key: 'watch', label: '내 관심사' },
]

export default function ScopeFilter() {
  const [active, setActive] = useActiveLens()

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {OPTS.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => setActive(o.key)}
          className={cn(
            'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
            active === o.key
              ? 'bg-brand-600/10 text-brand-600'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
