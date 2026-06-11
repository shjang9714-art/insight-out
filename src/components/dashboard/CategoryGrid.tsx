'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getKstTodayStartIso } from '@/lib/date'
import { CATEGORY_DEFS } from '@/lib/categories'

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
          cat.category === '유튜브'
            ? '/dashboard/youtube'
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}`

        const count = todayCounts[cat.category] ?? 0
        const isActive = cat.category === '유튜브'
          ? pathname.startsWith('/dashboard/youtube')
          : activeCategory === cat.category

        return (
          <Link
            key={cat.id}
            href={href}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 transition-colors ${
              isActive
                ? 'border-brand-600 text-brand-600'
                : 'border-border text-foreground/70 hover:border-brand-200 hover:text-foreground dark:text-foreground/80'
            }`}
          >
            {/* 오늘 건수 — 좌측 상단 뱃지 */}
            {count > 0 && (
              <span
                className={`absolute left-1 top-1 flex min-w-[16px] items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none ${
                  isActive ? 'bg-brand-600 text-white' : 'bg-brand-500 text-white'
                }`}
              >
                {count}
              </span>
            )}
            <span className="text-xl leading-none">{cat.icon}</span>
            <span className="text-center text-xs font-medium leading-tight">{cat.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
