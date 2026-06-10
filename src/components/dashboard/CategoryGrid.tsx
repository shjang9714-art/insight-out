'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ContentCategory } from '@/lib/types'
import { getKstTodayStartIso } from '@/lib/date'

const CATEGORY_DEFS: {
  id: string
  icon: string
  label: string
  category: ContentCategory | null
}[] = [
  { id: 'news',        icon: '📰', label: '뉴스 & 미디어',   category: '뉴스' },
  { id: 'gartner',     icon: '📊', label: '가트너 리포트',   category: '가트너' },
  { id: 'krg',         icon: '📋', label: 'KRG 리포트',      category: 'KRG' },
  { id: 'web-insight', icon: '💡', label: '웹 인사이트',     category: '웹인사이트' },
  { id: 'opinion',     icon: '💼', label: '오피니언 채널',   category: '오피니언' },
  { id: 'newsletter',  icon: '📧', label: '뉴스레터',        category: '뉴스레터' },
  { id: 'ai-report',   icon: '🤖', label: 'AI 보고서',       category: 'AI보고서' },
  { id: 'youtube',     icon: '▶️', label: '유튜브 영상',     category: null },
]

interface Props {
  activeService?: string
  activeCategory?: string
}

export default function CategoryGrid({ activeService = 'all', activeCategory = '' }: Props) {
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [totalCounts, setTotalCounts] = useState<Record<string, number>>({})
  const [totalLoaded, setTotalLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('contents')
        .select('category, collected_at')
        .eq('status', 'published')
        .gte('collected_at', getKstTodayStartIso()),
      supabase
        .from('contents')
        .select('category')
        .eq('status', 'published'),
    ]).then(([{ data: todayData }, { data: allData }]) => {
      if (todayData) {
        const c: Record<string, number> = {}
        for (const row of todayData) {
          c[row.category] = (c[row.category] ?? 0) + 1
        }
        setTodayCounts(c)
      }
      if (allData) {
        const t: Record<string, number> = {}
        for (const row of allData) {
          t[row.category] = (t[row.category] ?? 0) + 1
        }
        setTotalCounts(t)
      }
      setTotalLoaded(true)
    })
  }, [])

  const svcParam = activeService !== 'all' ? `&svc=${activeService}` : ''

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      {CATEGORY_DEFS.map((cat) => {
        const href =
          cat.category === null
            ? `/dashboard/youtube${activeService !== 'all' ? `?svc=${activeService}` : ''}`
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}${svcParam}`

        const count   = cat.category ? (todayCounts[cat.category] ?? 0) : 0
        const total   = cat.category ? (totalCounts[cat.category] ?? 0) : 0
        const isEmpty = totalLoaded && cat.category !== null && total === 0
        const isActive = cat.category
          ? activeCategory === cat.category
          : activeCategory === 'youtube'

        return (
          <Link
            key={cat.id}
            href={href}
            title={isEmpty ? '콘텐츠 준비 중' : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isEmpty
                ? 'pointer-events-none border border-border text-muted-foreground/50'
                : isActive
                  ? 'bg-brand-600 text-white'
                  : 'border border-border text-muted-foreground hover:border-brand-200 hover:text-foreground dark:hover:border-brand-700/50'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            {!isEmpty && count > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
