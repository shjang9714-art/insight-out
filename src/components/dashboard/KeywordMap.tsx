'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TAG_BUCKETS, type TagBucket } from '@/lib/tag-buckets'

export interface KeywordItem {
  name: string
  count: number
  size: number
  bucket: TagBucket
  watched: boolean
  isCompetitor: boolean
}

interface KeywordMapProps {
  keywords: KeywordItem[]
  hasWatchlist: boolean
}

export default function KeywordMap({ keywords, hasWatchlist }: KeywordMapProps) {
  const [selected, setSelected] = useState<TagBucket | null>(null)

  const bucketCounts = TAG_BUCKETS.reduce<Record<TagBucket, number>>(
    (acc, b) => {
      acc[b] = keywords.filter(k => k.bucket === b).length
      return acc
    },
    { '기술': 0, '시장·정책': 0, '업체': 0, '일반': 0 },
  )

  const visible = selected ? keywords.filter(k => k.bucket === selected) : keywords

  return (
    <div className="space-y-3">
      {/* 카테고리 필터 칩 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelected(null)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            selected === null
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          전체 <span className="opacity-70">{keywords.length}</span>
        </button>
        {TAG_BUCKETS.map(b => {
          const count = bucketCounts[b]
          const active = selected === b
          return (
            <button
              key={b}
              onClick={() => setSelected(active ? null : b)}
              disabled={count === 0}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : count === 0
                    ? 'cursor-not-allowed bg-muted text-muted-foreground/40'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {b} <span className="opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 키워드 클라우드 */}
      <div className="flex flex-wrap gap-x-3 gap-y-2 leading-relaxed">
        {visible.map(({ name, size, watched, isCompetitor }) => (
          <Link
            key={name}
            href={`/dashboard/topics/${encodeURIComponent(name)}`}
            style={{ fontSize: `${size}px` }}
            className={cn(
              'transition-opacity hover:opacity-75',
              watched
                ? 'text-brand-600 font-semibold bg-brand-600/10 rounded px-1 py-0.5'
                : isCompetitor
                  ? 'text-red-500'
                  : 'text-muted-foreground',
            )}
          >
            {name}
          </Link>
        ))}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-3 pt-1">
        {hasWatchlist && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-600" />
            관심업체
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          경쟁사
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
          일반
        </span>
      </div>
    </div>
  )
}
