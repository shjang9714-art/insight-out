'use client'

import { useState } from 'react'
import { Network, List } from 'lucide-react'
import dynamic from 'next/dynamic'
import EntityBrowse from '@/components/entities/EntityBrowse'
import { cn } from '@/lib/utils'
import type { EntitySummary } from '@/components/entities/KnowledgeGraph'
import type { EntityType } from '@/lib/types'

const KnowledgeGraph = dynamic(() => import('@/components/entities/KnowledgeGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
      그래프 로딩 중…
    </div>
  ),
})

type ViewMode = 'graph' | 'list'

interface EntityItem {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  mention_count: number
  description: string | null
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
  allEntities: EntityItem[]
  totalByType: Record<string, number>
}

export default function EntitiesPageClient({ initialCenter, entities, allEntities, totalByType }: Props) {
  const [view, setView] = useState<ViewMode>('graph')

  return (
    <div>
      {/* 헤더 + 뷰 토글 */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          기업·기술·인물·정책 등 엔티티를 탐색하고 관계를 확인합니다.
        </p>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <button
            onClick={() => setView('graph')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'graph'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Network className="h-3.5 w-3.5" />
            그래프
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'list'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="h-3.5 w-3.5" />
            목록
          </button>
        </div>
      </div>

      {/* 뷰 전환 */}
      {view === 'graph' ? (
        <KnowledgeGraph initialCenter={initialCenter} entities={entities} />
      ) : (
        <EntityBrowse entities={allEntities} totalByType={totalByType} />
      )}
    </div>
  )
}
