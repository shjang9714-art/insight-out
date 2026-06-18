'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'

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

const ENTITY_TYPE_STYLE: Record<EntityType, string> = {
  company:  'border-brand-200 bg-brand-50 text-brand-700',
  tech:     'border-blue-200 bg-blue-50 text-blue-700',
  product:  'border-violet-200 bg-violet-50 text-violet-700',
  person:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  policy:   'border-amber-200 bg-amber-50 text-amber-700',
  industry: 'border-border bg-muted text-muted-foreground',
}

function entityStyle(type: EntityType, isCompetitor: boolean): string {
  if (type === 'company' && isCompetitor) return 'border-red-200 bg-red-50 text-red-700'
  return ENTITY_TYPE_STYLE[type]
}

const TYPE_TABS = ['전체', ...Object.keys(ENTITY_TYPE_LABEL)] as const
type TypeTab = (typeof TYPE_TABS)[number]

export default function EntityBrowse({ entities, totalByType }: Props) {
  const [activeType, setActiveType] = useState<TypeTab>('전체')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    let list = entities
    if (activeType !== '전체') {
      list = list.filter((e) => e.entity_type === activeType)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((e) => e.canonical_name.toLowerCase().includes(q))
    }
    return list
  }, [entities, activeType, query])

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
                  ? 'border-brand-600 bg-brand-600 text-white'
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

      {/* 검색 */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="엔티티 이름 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
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
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-brand-600/40 hover:bg-accent/50"
            >
              <span className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                entityStyle(e.entity_type, e.is_competitor),
              )}>
                {ENTITY_TYPE_LABEL[e.entity_type]}
                {e.is_competitor && e.entity_type === 'company' && ' · 경쟁'}
              </span>

              <span className="flex-1 truncate text-sm font-medium text-foreground group-hover:text-brand-600">
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
