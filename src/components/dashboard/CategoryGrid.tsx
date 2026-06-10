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
  category: ContentCategory | null // null = youtube (별도 페이지)
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

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contents')
      .select('category, collected_at')
      .eq('status', 'published')
      .gte('collected_at', getKstTodayStartIso())
      .then(({ data }) => {
        if (!data) return
        const c: Record<string, number> = {}
        for (const row of data) {
          c[row.category] = (c[row.category] ?? 0) + 1
        }
        setTodayCounts(c)
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

        const count = cat.category ? (todayCounts[cat.category] ?? 0) : 0
        const isActive = cat.category
          ? activeCategory === cat.category
          : activeCategory === 'youtube'

        return (
          <Link
            key={cat.id}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-600 text-white'
                : 'border border-border text-muted-foreground hover:border-brand-200 hover:text-foreground'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            {count > 0 && (
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
