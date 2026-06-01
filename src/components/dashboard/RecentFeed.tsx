'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

// 사이드바 mock serviceId → DB services.name 매핑
const MOCK_ID_TO_SERVICE_NAME: Record<string, string> = {
  connectivity:      'Connectivity',
  'security-cloud':  '보안/클라우드',
  m2m:               'M2M',
  aicc:              'AICC',
  aidc:              'AIDC',
  mobility:          '모빌리티',
  enterprise:        '기업솔루션',
}

const CATEGORY_COLOR: Partial<Record<ContentCategory, string>> = {
  '뉴스':    'bg-brand-50 text-brand-600',
  '가트너':  'bg-purple-50 text-purple-700',
  'KRG':    'bg-orange-50 text-orange-700',
  '웹인사이트': 'bg-teal-50 text-teal-700',
  '오피니언': 'bg-green-50 text-green-700',
  '뉴스레터': 'bg-indigo-50 text-indigo-700',
  'AI보고서': 'bg-pink-50 text-pink-700',
  '유튜브':  'bg-red-50 text-red-700',
}

interface FeedItem {
  id: string
  title: string
  summary_ko: string | null
  category: ContentCategory
  published_at: string | null
  sources: { name: string } | null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1)   return '방금 전'
  if (h < 24)  return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7)   return `${d}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
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

      // 서비스 필터: mock serviceId → DB UUID → content_ids
      let contentIds: string[] | null = null

      if (activeService !== 'all') {
        const serviceName = MOCK_ID_TO_SERVICE_NAME[activeService]
        if (serviceName) {
          const { data: svc } = await supabase
            .from('services')
            .select('id')
            .eq('name', serviceName)
            .maybeSingle()

          if (svc?.id) {
            const { data: cs } = await supabase
              .from('content_services')
              .select('content_id')
              .eq('service_id', svc.id)
            contentIds = cs?.map((r) => r.content_id) ?? []
          } else {
            contentIds = []
          }
        }
      }

      if (contentIds !== null && contentIds.length === 0) {
        if (!cancelled) { setItems([]); setLoading(false) }
        return
      }

      let q = supabase
        .from('contents')
        .select('id, title, summary_ko, category, published_at, sources(name)')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(5)

      if (contentIds) q = q.in('id', contentIds)

      const { data } = await q
      if (!cancelled) {
        setItems((data ?? []) as unknown as FeedItem[])
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeService])

  const contentsHref =
    activeService !== 'all'
      ? `/dashboard/contents?service=${activeService}`
      : '/dashboard/contents'

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">최근 피드</h2>
        <Link href={contentsHref} className="text-xs text-brand-600 hover:underline">
          전체 보기
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="flex gap-2">
                <div className="h-4 w-14 rounded-full bg-gray-100" />
                <div className="h-4 w-16 rounded-full bg-gray-100" />
              </div>
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-5/6 rounded bg-gray-100" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-xs text-gray-400">
          해당 서비스의 최근 피드가 없습니다
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-50">
          {items.map((item) => {
            const catColor =
              CATEGORY_COLOR[item.category] ?? 'bg-gray-100 text-gray-600'
            return (
              <div
                key={item.id}
                className="group cursor-pointer py-3.5 first:pt-0 last:pb-0"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${catColor}`}
                  >
                    {CONTENT_CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                  {item.sources?.name && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                      {item.sources.name}
                    </span>
                  )}
                </div>
                <p className="mb-1 line-clamp-2 text-sm font-medium leading-snug text-gray-900 group-hover:text-brand-600">
                  {item.title}
                </p>
                {item.summary_ko && (
                  <p className="mb-1.5 line-clamp-1 text-xs text-gray-500">
                    {item.summary_ko}
                  </p>
                )}
                <span className="text-xs text-gray-400">
                  {timeAgo(item.published_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
