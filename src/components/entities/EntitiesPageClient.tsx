'use client'

import { useState } from 'react'
import { Network, List } from 'lucide-react'
import dynamic from 'next/dynamic'
import EntityBrowse from '@/components/entities/EntityBrowse'
import { cn } from '@/lib/utils'
import type { GraphNode, GraphLink } from '@/components/entities/KnowledgeGraph'
import type { EntityType } from '@/lib/types'

const KnowledgeGraph = dynamic(() => import('@/components/entities/KnowledgeGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
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
  nodes: GraphNode[]
  links: GraphLink[]
  rpcUnavailable: boolean
  entities: EntityItem[]
  totalByType: Record<string, number>
}

export default function EntitiesPageClient({ nodes, links, rpcUnavailable, entities, totalByType }: Props) {
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

      {/* RPC 미적용 안내 (그래프 뷰에서만) */}
      {view === 'graph' && rpcUnavailable && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          관계 데이터(RPC) 미적용 상태입니다. 수희가 SQL을 적용한 후 엣지가 표시됩니다.
        </div>
      )}

      {/* 뷰 전환 */}
      {view === 'graph' ? (
        <KnowledgeGraph nodes={nodes} links={links} />
      ) : (
        <EntityBrowse entities={entities} totalByType={totalByType} />
      )}
    </div>
  )
}
