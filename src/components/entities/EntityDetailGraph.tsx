'use client'

import dynamic from 'next/dynamic'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'

const KnowledgeGraph = dynamic(() => import('@/components/entities/KnowledgeGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
      그래프 로딩 중…
    </div>
  ),
})

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
}

export default function DetailGraph({ initialCenter, entities }: Props) {
  return <KnowledgeGraph initialCenter={initialCenter} entities={entities} />
}
