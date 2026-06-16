'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ContentCard from '@/components/dashboard/ContentCard'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { type ContentCategory } from '@/lib/types'
import EditPreferencesButton from './EditPreferencesButton'
import OnboardingKeywordPicker from './OnboardingKeywordPicker'

interface ServiceOption {
  id: string
  name: string
}

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

interface Section {
  slot: 'personalized' | 'trending' | 'editor' | 'explore'
  label: string
  quota: number
  items: FeedItem[]
}

interface RecommendedFeedProps {
  services: ServiceOption[]
  fallbackTrending: boolean
  initialServiceId: string | null
  initialKeywordIds: string[]
  initialKeywordMap: Record<string, string>
}

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

// 슬롯 비율 60/20/10/10. fallbackTrending(건너뛰기) 시에는 personalized 대신 trending이 60%를 차지.
function buildSlotMeta(fallbackTrending: boolean): { slot: Section['slot']; label: string; quota: number }[] {
  const dominant = fallbackTrending
    ? { slot: 'trending' as const, label: '트렌딩', quota: 6 }
    : { slot: 'personalized' as const, label: '맞춤 추천', quota: 6 }
  const secondary = fallbackTrending
    ? { slot: 'personalized' as const, label: '맞춤 추천', quota: 2 }
    : { slot: 'trending' as const, label: '트렌딩', quota: 2 }

  return [
    dominant,
    secondary,
    { slot: 'editor', label: '에디터픽', quota: 1 },
    { slot: 'explore', label: '새로운 시도', quota: 1 },
  ]
}

export default function RecommendedFeed({
  services,
  fallbackTrending,
  initialServiceId,
  initialKeywordIds,
  initialKeywordMap,
}: RecommendedFeedProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'feed' | 'edit'>('feed')
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadFeed = async () => {
      setIsLoading(true)
      const slotMeta = buildSlotMeta(fallbackTrending)

      const results = await Promise.all(
        slotMeta.map((meta) =>
          fetch(`/api/feed/recommended?slot=${meta.slot}&limit=${meta.quota}`)
            .then((res) => res.json())
            .catch(() => ({ items: [] }))
        )
      )

      const built: Section[] = slotMeta.map((meta, i) => ({
        ...meta,
        items: (results[i]?.items ?? []) as FeedItem[],
      }))

      // 빈 슬롯(예: explore 0건)은 1순위(dominant) 슬롯에서 보충
      const shortfall = built
        .slice(1)
        .reduce((sum, section) => sum + Math.max(0, section.quota - section.items.length), 0)

      if (shortfall > 0) {
        const dominant = slotMeta[0]
        const res = await fetch(`/api/feed/recommended?slot=${dominant.slot}&limit=${dominant.quota + shortfall}`)
          .then((r) => r.json())
          .catch(() => ({ items: [] }))
        const existingIds = new Set(built[0].items.map((item) => item.id))
        const extra = ((res.items ?? []) as FeedItem[]).filter((item) => !existingIds.has(item.id)).slice(0, shortfall)
        built[0] = { ...built[0], items: [...built[0].items, ...extra] }
      }

      if (!cancelled) {
        setSections(built.filter((section) => section.items.length > 0))
        setIsLoading(false)
      }
    }

    loadFeed()
    return () => {
      cancelled = true
    }
  }, [fallbackTrending, reloadKey])

  if (mode === 'edit') {
    return (
      <OnboardingKeywordPicker
        services={services}
        mode="edit"
        initialServiceId={initialServiceId}
        initialKeywordIds={initialKeywordIds}
        initialKeywordMap={initialKeywordMap}
        onSaved={() => {
          setMode('feed')
          router.refresh()
          setReloadKey((k) => k + 1)
        }}
        onCancel={() => setMode('feed')}
      />
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {fallbackTrending ? '지금 화제가 되는 콘텐츠' : '맞춤 추천 피드'}
        </h2>
        <EditPreferencesButton
          label={fallbackTrending ? '관심사 설정하기' : '관심사 편집'}
          onClick={() => setMode('edit')}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : sections.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          추천할 콘텐츠가 아직 없습니다
        </p>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.slot}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{section.label}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
