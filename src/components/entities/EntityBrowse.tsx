'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import { entityStyle } from '@/lib/entities/entity-style'

interface EntityItem {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
  mention_count: number
  description: string | null
}

interface Props {
  entities: EntityItem[]
  totalByType: Record<string, number>
}

const TYPE_TABS = ['전체', ...Object.keys(ENTITY_TYPE_LABEL)] as const
type TypeTab = (typeof TYPE_TABS)[number]

export default function EntityBrowse({ entities, totalByType }: Props) {
  const [activeType, setActiveType] = useState<TypeTab>('전체')

  const filtered = useMemo(() => {
    if (activeType === '전체') return entities
    return entities.filter((e) => e.entity_type === activeType)
  }, [entities, activeType])

  return (
    <>
      {/* 타입 탭 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPE_TABS.map((tab) => {
          const count = totalByType[tab] ?? 0
          const isActive = activeType === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveType(tab)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'border-brand-600 bg-brand-solid text-white'
                  : 'border-border bg-card text-muted-foreground hover:border-brand-600/40 hover:text-foreground',
              )}
            >
              {tab === '전체' ? '전체' : ENTITY_TYPE_LABEL[tab as EntityType]}
              <span className={cn('text-[10px]', isActive ? 'opacity-80' : 'opacity-60')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          조건에 맞는 엔티티가 없습니다.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/entities/${e.id}`}
              prefetch={false}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-brand-600/40 hover:bg-accent/50"
            >
              <span className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                entityStyle(e.entity_type, e.is_competitor),
              )}>
                {ENTITY_TYPE_LABEL[e.entity_type]}
                {e.is_competitor && e.entity_type === 'company' && ' · 경쟁'}
              </span>

              <span className="flex-1 truncate text-sm font-medium text-foreground group-hover:text-foreground/70">
                {e.canonical_name}
              </span>

              {e.description && (
                <span className="hidden max-w-xs truncate text-[11px] text-muted-foreground sm:block">
                  {e.description}
                </span>
              )}

              <span className="shrink-0 text-[11px] text-muted-foreground/60">
                {e.mention_count.toLocaleString()}건
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
