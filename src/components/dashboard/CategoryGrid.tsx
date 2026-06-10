'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ContentCategory } from '@/lib/types'
import { getKstTodayStartIso } from '@/lib/date'

// ─── mock taxonomy (아이콘·표시 레이블·순서만 여기서 관리) ────────────────────

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

const ITEM_CLASS =
  'flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-all hover:border-brand-200 hover:shadow-sm group'

interface Props {
  activeService?: string
}

export default function CategoryGrid({ activeService = 'all' }: Props) {
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})

  // 오늘 KST 0시 이후 수집된 카테고리별 신규 건수 로드
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

  const svcSuffix = activeService !== 'all' ? `?service=${activeService}` : ''

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {CATEGORY_DEFS.map((cat) => {
        // 유튜브는 기존 별도 페이지로
        const href =
          cat.category === null
            ? `/dashboard/youtube${svcSuffix}`
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}${activeService !== 'all' ? `&service=${activeService}` : ''}`

        const today = cat.category ? (todayCounts[cat.category] ?? 0) : 0
        const todayText = today > 0 ? `오늘 ${today}건 업데이트` : '업데이트 없음'

        const inner = (
          <>
            <span className="text-2xl">{cat.icon}</span>
            <span className="text-xs font-medium leading-tight text-foreground group-hover:text-brand-600">
              {cat.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{todayText}</span>
          </>
        )

        return (
          <Link key={cat.id} href={href} className={ITEM_CLASS}>
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
