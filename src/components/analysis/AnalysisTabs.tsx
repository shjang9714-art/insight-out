'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'insights', label: 'AI 인사이트' },
  { id: 'issues',   label: '이슈' },
  { id: 'entities', label: '지식그래프' },
]

interface Props {
  activeTab: string
}

export default function AnalysisTabs({ activeTab }: Props) {
  return (
    <div className="mb-6 inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/dashboard/ai-analysis?tab=${t.id}`}
          className={cn(
            'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
            activeTab === t.id
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
