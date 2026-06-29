'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'briefing', label: '브리핑' },
  { id: 'issues',   label: '이슈' },
]

export default function AiInsightTabs() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'briefing'

  return (
    <div className="mb-6 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/dashboard/issues?view=${t.id}`}
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
