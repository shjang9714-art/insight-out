'use client'

import { useState, useMemo } from 'react'
import { Network, List } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import EntityBrowse from '@/components/entities/EntityBrowse'
import LensSwitcher from '@/components/lens/LensSwitcher'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  matchesLens,
  lensScore,
  LENS_PRESETS,
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
}

interface Props {
  initialCenter: EntitySummary | null
  entities: EntitySummary[]
  allEntities: EntityItem[]
  totalByType: Record<string, number>
  showLensSwitcher?: boolean
}

// ─── 렌즈 배지 ────────────────────────────────────────────────────────────────

function EntityLensBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-600/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
      {label}
    </span>
  )
}

export default function EntitiesPageClient({
  initialCenter,
  entities,
  allEntities,
  totalByType,
  showLensSwitcher = true,
}: Props) {
  const [view, setView] = useState<ViewMode>('graph')
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()

  // 미설정 여부 판단
  const hasSetting = activeLens === 'only' ? ctx.count > 0 : true

  // 렌즈 적용된 엔티티 목록 (list 뷰용)
  const lensedEntities = useMemo(() => {
    if (activeLens === 'all') return allEntities

    return allEntities
      .map(e => {
        const target: LensTarget = {
          names: [e.canonical_name],
          isCompetitor: e.is_competitor,
          entityId: e.id,
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
      {/* 뷰 토글 — 페이지 설명은 공통 헤더(PageHeader)로 이동 */}
      <div className="mb-4 flex justify-end">
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

      {/* 보기 스위처 */}
      {showLensSwitcher && (
        <div className="mb-4">
          <LensSwitcher />
        </div>
      )}

      {/* 보기 결과 요약 (list 뷰에서 필터 활성 시) */}
      {view === 'list' && activeLens !== 'all' && lensedEntities.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <EntityLensBadge
            label={`${LENS_PRESETS[activeLens].label} · ${lensedEntities.length}개`}
          />
          <button
            type="button"
            onClick={() => setActiveLens('all')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            전체 보기 →
          </button>
        </div>
      )}

      {/* 뷰 전환 */}
      {view === 'graph' ? (
        <KnowledgeGraph initialCenter={initialCenter} entities={entities} />
      ) : lensedEntities.length === 0 && activeLens !== 'all' ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          {!hasSetting ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                관심 기업을 설정하면 여기에 모아 보여드려요.
              </p>
              <Link
                href="/dashboard/mypage"
                className="inline-block text-xs text-brand-600 hover:underline"
              >
                마이페이지에서 설정하기 →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                설정하신 관심 기업 관련 엔티티가 아직 없어요.
              </p>
              <button
                type="button"
                onClick={() => setActiveLens('all')}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                전체 보기로 전환
              </button>
            </div>
          )}
        </div>
      ) : (
        <EntityBrowse
          entities={activeLens === 'all' ? allEntities : lensedEntities}
          totalByType={lensedTotalByType}
        />
      )}
    </div>
  )
}
