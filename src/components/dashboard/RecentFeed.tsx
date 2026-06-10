'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import ContentCard from './ContentCard'


interface FeedItem {
  id: string
  title: string
  summary_ko: string | null
  category: ContentCategory
  published_at: string | null
  thumbnail_url: string | null
  sources: { name: string } | null
  content_services: { service_id: string }[]
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

interface Props {
  activeService?: string
}

export default function RecentFeed({ activeService = 'all' }: Props) {
  const [items, setItems]       = useState<FeedItem[]>([])
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const supabase = createClient()

      // 서비스 필터: activeService는 UUID 또는 'all'
      let contentIds: string[] | null = null

      if (activeService !== 'all') {
        const { data: cs } = await supabase
          .from('content_services')
          .select('content_id')
          .eq('service_id', activeService)
        contentIds = cs?.map((r) => r.content_id) ?? []
      }

      if (contentIds !== null && contentIds.length === 0) {
        if (!cancelled) { setItems([]); setLoading(false) }
        return
      }

      // 태그 있는 콘텐츠 우선 노출을 위해 20건 조회 후 client-side 정렬
      let q = supabase
        .from('contents')
        .select('id, title, summary_ko, category, published_at, thumbnail_url, sources(name), content_services(service_id)')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(20)

      if (contentIds) q = q.in('id', contentIds)

      const { data } = await q
      if (!cancelled) {
        const raw = (data ?? []) as unknown as FeedItem[]
        // 서비스 태그 있는 콘텐츠를 앞으로 정렬, 동순위 내에서는 published_at 순 유지
        const sorted = [...raw].sort((a, b) => {
          const aHasTag = a.content_services.length > 0 ? 0 : 1
          const bHasTag = b.content_services.length > 0 ? 0 : 1
          return aHasTag - bHasTag
        })
        setItems(sorted.slice(0, 6))
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeService])

  const contentsHref =
    activeService !== 'all'
      ? `/dashboard/contents?svc=${activeService}`
      : '/dashboard/contents'

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">최근 피드</h2>
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
              summaryKo={item.summary_ko}
              category={item.category}
              sourceName={item.sources?.name ?? null}
              publishedAt={item.published_at}
              thumbnailUrl={item.thumbnail_url}
              href={item.category === '유튜브' ? null : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
