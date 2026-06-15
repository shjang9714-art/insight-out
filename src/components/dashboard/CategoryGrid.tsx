'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getKstTodayStartIso } from '@/lib/date'
import { CATEGORY_DEFS } from '@/lib/categories'
import { Home } from 'lucide-react'

export default function CategoryGrid() {
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [totalCounts, setTotalCounts] = useState<Record<string, number>>({})
  const [totalLoaded, setTotalLoaded] = useState(false)
  const searchParams   = useSearchParams()
  const pathname       = usePathname()
  const activeCategory = searchParams.get('category') ?? ''

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

  const isHome = pathname === '/dashboard'

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto scrollbar-hide">
      {/* 홈 버튼 — 카테고리 줄 맨 앞 */}
      <Link
        href="/dashboard"
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 transition-colors ${
          isHome
            ? 'border-brand-600 text-brand-600'
            : 'border-border text-muted-foreground hover:border-brand-200 hover:text-brand-600'
        }`}
      >
        <Home className="h-5 w-5" />
        <span className="text-center text-xs font-medium leading-tight">홈</span>
      </Link>

      {CATEGORY_DEFS.map((cat) => {
        const href = cat.href ?? `/dashboard/contents?category=${encodeURIComponent(cat.category)}`

        // 오늘 건수: dbCategories 합산
        const count = cat.dbCategories.reduce((s, c) => s + (todayCounts[c] ?? 0), 0)
        const total = cat.dbCategories.reduce((s, c) => s + (totalCounts[c] ?? 0), 0)
        const isEmpty = totalLoaded && total === 0
        const isActive = cat.href
          ? pathname.startsWith(cat.href)
          : activeCategory === cat.category

        return (
          <Link
            key={cat.id}
            href={href}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 transition-colors ${
              isActive
                ? cat.activeClass
                : `border-border text-muted-foreground ${cat.hoverClass}`
            }`}
          >
            {/* 오늘 건수 — 좌측 상단 뱃지 */}
            {count > 0 && (
              <span className="absolute left-1 top-1 flex min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                {count}
              </span>
            )}
            <cat.Icon className={`h-5 w-5 ${cat.iconClass}`} />
            <span className="text-center text-xs font-medium leading-tight">{cat.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
