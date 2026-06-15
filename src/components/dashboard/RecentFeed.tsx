'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import ContentCard from './ContentCard'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { isB2BRelevant } from '@/lib/feed-blocklist'


interface FeedItem {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  category: ContentCategory
  published_at: string | null
  thumbnail_url: string | null
  sources: { name: string } | null
  matched_groups: string[]
  matched_keywords: string[]
}

// ─── 카드 스켈레톤 ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-card overflow-hidden">
      <div className="aspect-[16/9] bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-16 rounded-full bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-4/5 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  )
}

export default function RecentFeed() {
  const [items, setItems]         = useState<FeedItem[]>([])
  const [filteredOut, setFilteredOut] = useState(0)
  const [isLoading, setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const supabase = createClient()

      // 태그 있는 콘텐츠 우선 노출을 위해 40건 조회 후 client-side 필터·정렬
      const { data } = await supabase
        .from('contents')
        .select('id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(40)

      if (!cancelled) {
        const raw = (data ?? []) as unknown as FeedItem[]

        // ① B2B 무관 기사 필터 (블록리스트 키워드 포함 제외)
        const beforeFilter = raw.length
        const filtered = raw.filter((item) => isB2BRelevant(item.title, item.summary_ko))
        const removedCount = beforeFilter - filtered.length

        // ② 서비스 태그 있는 콘텐츠 우선 정렬 (동순위 내 published_at 순 유지)
        const sorted = [...filtered].sort((a, b) => {
          const aHasTag = (a.matched_groups?.length ?? 0) > 0 ? 0 : 1
          const bHasTag = (b.matched_groups?.length ?? 0) > 0 ? 0 : 1
          return aHasTag - bHasTag
        })

        setItems(sorted.slice(0, 6))
        setFilteredOut(removedCount)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const contentsHref = '/dashboard/contents'

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">최근 피드</h2>
          {!isLoading && filteredOut > 0 && (
            <span className="text-[10px] text-muted-foreground" title={`B2B 무관 기사 ${filteredOut}건 필터됨`}>
              ({filteredOut}건 필터)
            </span>
          )}
        </div>
        <Link href={contentsHref} className="text-xs text-brand-600 hover:underline">
          전체 보기
        </Link>
      </div>

      {/* 로딩 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          해당 서비스의 최근 피드가 없습니다
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              id={item.id}
              title={item.title}
              summaryKo={toExcerpt(item.summary_ko, item.body_original)}
              category={item.category}
              sourceName={item.sources?.name ?? null}
              publishedAt={item.published_at}
              thumbnailUrl={item.thumbnail_url}
              href={item.category === '유튜브' ? null : undefined}
              keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
