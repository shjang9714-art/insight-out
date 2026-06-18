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
    <div className="flex border-b border-border mb-6">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/dashboard/ai-analysis?tab=${t.id}`}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === t.id
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
