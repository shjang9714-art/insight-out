'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ContentCategory } from '@/lib/types'
import { getKstTodayStartIso } from '@/lib/date'

const CATEGORY_DEFS: {
  id: string
  icon: string
  label: string
  category: ContentCategory | null
}[] = [
  { id: 'news',        icon: '📰', label: '뉴스',      category: '뉴스' },
  { id: 'gartner',     icon: '📊', label: '가트너',    category: '가트너' },
  { id: 'krg',         icon: '📋', label: 'KRG',       category: 'KRG' },
  { id: 'web-insight', icon: '💡', label: '웹인사이트', category: '웹인사이트' },
  { id: 'opinion',     icon: '💼', label: '오피니언',  category: '오피니언' },
  { id: 'newsletter',  icon: '📧', label: '뉴스레터',  category: '뉴스레터' },
  { id: 'ai-report',   icon: '🤖', label: 'AI보고서',  category: 'AI보고서' },
  { id: 'youtube',     icon: '▶️', label: '유튜브',    category: null },
]

export default function CategoryGrid() {
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const searchParams   = useSearchParams()
  const pathname       = usePathname()
  const activeCategory = searchParams.get('category') ?? ''

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

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto scrollbar-hide">
      {CATEGORY_DEFS.map((cat) => {
        const href =
          cat.category === null
            ? '/dashboard/youtube'
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}`

        const count = cat.category ? (todayCounts[cat.category] ?? 0) : 0
        const isActive = cat.category
          ? activeCategory === cat.category
          : pathname.startsWith('/dashboard/youtube')

        return (
          <Link
            key={cat.id}
            href={href}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-colors ${
              isActive
                ? 'border-brand-600 text-brand-600'
                : 'border-border text-muted-foreground hover:border-brand-200 hover:text-foreground'
            }`}
          >
            <span className="text-base leading-none">{cat.icon}</span>
            <span className="text-center text-[10px] font-medium leading-tight">{cat.label}</span>
            {count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                  isActive ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'
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
