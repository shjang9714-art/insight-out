'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ContentCard from '@/components/dashboard/ContentCard'
import { toExcerpt, tagsOf2 } from '@/lib/contents/excerpt'
import { type ContentCategory } from '@/lib/types'
import { dedupSimilarItems } from '@/lib/feed-dedup'
import EditPreferencesButton from './EditPreferencesButton'
import FeedCategoryModal from './FeedCategoryModal'
import FeedCarousel from './FeedCarousel'

export interface FeedItem {
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
  slot: 'personalized' | 'trending' | 'editor'
  label: string
  quota: number
  items: FeedItem[]
}

interface RecommendedFeedProps {
  fallbackTrending: boolean
  initialCategoryKeys: string[]
  fallbackItems?: FeedItem[]
}

// 실제 ContentCard와 동일한 구조(커버 → 배지 → 태그 pill → 제목 2줄 → 메타)로
// 스켈레톤을 구성 — 로딩→완료 전환 시 그리드↔스트립 레이아웃 점프 방지.
function CardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <div className="aspect-[16/9] animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-10 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mb-1.5 h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mb-2 h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="mt-auto h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

// 슬롯 비율 60/20/10. fallbackTrending(건너뛰기) 시에는 personalized 대신 trending이 60%를 차지.
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
  ]
}

export default function RecommendedFeed({
  fallbackTrending,
  initialCategoryKeys,
  fallbackItems = [],
}: RecommendedFeedProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadFeed = async () => {
      setIsLoading(true)
      const slotMeta = buildSlotMeta(fallbackTrending)

      // 2·3순위 슬롯이 quota를 못 채울 경우를 대비한 여유분(이론상 최대 부족분 =
      // 2·3순위 quota 합)을 1순위 슬롯 요청에 처음부터 포함시킨다. 기존에는 부족분이
      // 생길 때마다 1순위 슬롯에 순차 왕복을 한 번 더 보냈는데(에디터픽처럼 원천적으로
      // 빈도 낮은 슬롯에서 드물지 않게 발생), 그때마다 왕복 1회만큼 로딩이 느려졌음 —
      // 처음부터 여유분을 병렬 요청에 포함시켜 추가 왕복 자체를 없앤다. (2026-07-10)
      const backfillBuffer = slotMeta.slice(1).reduce((sum, m) => sum + m.quota, 0)

      const results = await Promise.all(
        slotMeta.map((meta, i) =>
          fetch(`/api/feed/recommended?slot=${meta.slot}&limit=${i === 0 ? meta.quota + backfillBuffer : meta.quota}`)
            .then((res) => res.json())
            .catch(() => ({ items: [] }))
        )
      )

      const dominantAll = (results[0]?.items ?? []) as FeedItem[]
      const built: Section[] = slotMeta.map((meta, i) => ({
        ...meta,
        items: i === 0 ? dominantAll.slice(0, meta.quota) : ((results[i]?.items ?? []) as FeedItem[]),
      }))

      // 빈 슬롯(예: editor 0건)은 1차 요청에 이미 확보해둔 1순위 여유분(dominantAll)에서
      // 보충 — 추가 네트워크 왕복 없음
      const shortfall = built
        .slice(1)
        .reduce((sum, section) => sum + Math.max(0, section.quota - section.items.length), 0)

      if (shortfall > 0) {
        const existingIds = new Set(built[0].items.map((item) => item.id))
        const extra = dominantAll.filter((item) => !existingIds.has(item.id)).slice(0, shortfall)
        built[0] = { ...built[0], items: [...built[0].items, ...extra] }
      }

      // 슬롯간 글로벌 dedup: 우선순위 순으로 합쳐 dedup 후 각 슬롯에서 제거된 항목 필터
      const allItems = built.flatMap((s) => s.items)
      const kept = dedupSimilarItems(allItems)
      const keptIds = new Set(kept.map((item) => item.id))
      for (const section of built) {
        section.items = section.items.filter((item) => keptIds.has(item.id))
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

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <FeedCategoryModal
        open={editOpen}
        onOpenChange={setEditOpen}
        initialCategoryKeys={initialCategoryKeys}
        onSaved={() => {
          setEditOpen(false)
          router.refresh()
          setReloadKey((k) => k + 1)
        }}
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {fallbackTrending ? '지금 화제가 되는 콘텐츠' : '맞춤 추천 피드'}
        </h2>
        <EditPreferencesButton
          label={fallbackTrending ? '관심사 설정하기' : '관심사 눌러 추천받기'}
          onClick={() => setEditOpen(true)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {buildSlotMeta(fallbackTrending).map((meta) => (
            <div key={meta.slot}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{meta.label}</h3>
              <FeedCarousel cardHeight={196} autoplay={false}>
                {Array.from({ length: meta.quota }).map((_, i) => <CardSkeleton key={i} />)}
              </FeedCarousel>
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        fallbackItems.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">요즘 주목할 콘텐츠</h3>
            <FeedCarousel cardHeight={196}>
              {fallbackItems.map((item) => (
                <ContentCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  summaryKo={toExcerpt(item.summary_ko, item.body_original)}
                  category={item.category}
                  sourceName={item.sources?.name ?? null}
                  publishedAt={item.published_at}
                  thumbnailUrl={null}
                  href={item.category === '유튜브' ? null : undefined}
                  keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                />
              ))}
            </FeedCarousel>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              관심사를 설정하면 더 잘 맞는 추천을 받을 수 있어요.
            </p>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            추천할 콘텐츠가 아직 없습니다
          </p>
        )
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.slot}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{section.label}</h3>
              <FeedCarousel cardHeight={196}>
                {section.items.map((item) => (
                  <ContentCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    summaryKo={toExcerpt(item.summary_ko, item.body_original)}
                    category={item.category}
                    sourceName={item.sources?.name ?? null}
                    publishedAt={item.published_at}
                    thumbnailUrl={null}
                    href={item.category === '유튜브' ? null : undefined}
                    keywords={tagsOf2(item.matched_groups ?? [], item.matched_keywords ?? [], item.category)}
                  />
                ))}
              </FeedCarousel>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
