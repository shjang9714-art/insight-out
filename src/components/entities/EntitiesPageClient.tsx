'use client'

import { useState, useMemo } from 'react'
import { Network, List } from 'lucide-react'
import dynamic from 'next/dynamic'
import EntityBrowse from '@/components/entities/EntityBrowse'
import LensSwitcher from '@/components/lens/LensSwitcher'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  type LensTarget,
} from '@/lib/lens'
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
  service_id?: string | null
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
  allEntities: EntityItem[]
  totalByType: Record<string, number>
}

// ─── 렌즈 배지 ────────────────────────────────────────────────────────────────

function EntityLensBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-600/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
      {label}
    </span>
  )
}

export default function EntitiesPageClient({ initialCenter, entities, allEntities, totalByType }: Props) {
  const [view, setView] = useState<ViewMode>('graph')
  const ctx = useLensContext()
  const [activeLens] = useActiveLens()

  // 렌즈 적용된 엔티티 목록 (list 뷰용)
  const lensedEntities = useMemo(() => {
    if (activeLens === 'all') return allEntities

    return allEntities
      .map(e => {
        const target: LensTarget = {
          serviceIds: e.service_id ? [e.service_id] : undefined,
          names: [e.canonical_name],
          isCompetitor: e.is_competitor,
        }
        const score   = lensScore(activeLens, ctx, target)
        const matched = matchesLens(activeLens, ctx, target)
        return { entity: e, score, matched }
      })
      .filter(({ matched }) => matched)
      .sort((a, b) => b.score - a.score)
      .map(({ entity }) => entity)
  }, [allEntities, activeLens, ctx])

  // totalByType은 렌즈 필터 적용
  const lensedTotalByType = useMemo<Record<string, number>>(() => {
    if (activeLens === 'all') return totalByType
    const byType: Record<string, number> = { 전체: lensedEntities.length }
    for (const e of lensedEntities) {
      byType[e.entity_type] = (byType[e.entity_type] ?? 0) + 1
    }
    return byType
  }, [lensedEntities, activeLens, totalByType])

  return (
    <div>
      {/* 헤더 + 뷰 토글 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* 렌즈 스위처 */}
      <div className="mb-4">
        <LensSwitcher />
      </div>

      {/* 렌즈 결과 요약 (list 뷰에서 필터 활성 시) */}
      {view === 'list' && activeLens !== 'all' && (
        <div className="mb-3 flex items-center gap-2">
          <EntityLensBadge
            label={activeLens === 'mine' ? '내 담당' : '경쟁사 워치'}
          />
          <span className="text-xs text-muted-foreground">
            {lensedEntities.length}개 엔티티
          </span>
        </div>
      )}

      {/* 뷰 전환 */}
      {view === 'graph' ? (
        <KnowledgeGraph initialCenter={initialCenter} entities={entities} />
      ) : (
        <EntityBrowse
          entities={activeLens === 'all' ? allEntities : lensedEntities}
          totalByType={lensedTotalByType}
        />
      )}
    </div>
  )
}
