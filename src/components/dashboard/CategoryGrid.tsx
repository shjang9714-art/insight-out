'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { type LucideIcon, Newspaper, BarChart3, FileText, Lightbulb, MessageSquare, Mail, Bot, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ContentCategory } from '@/lib/types'

function todayStartKstIso(): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const midnightUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000
  return new Date(midnightUtc).toISOString()
}

const CATEGORY_DEFS: {
  id: string
  Icon: LucideIcon
  label: string
  category: ContentCategory | null
}[] = [
  { id: 'news',        Icon: Newspaper,      label: '뉴스 & 미디어',  category: '뉴스' },
  { id: 'gartner',     Icon: BarChart3,      label: '가트너 리포트',  category: '가트너' },
  { id: 'krg',         Icon: FileText,       label: 'KRG 리포트',     category: 'KRG' },
  { id: 'web-insight', Icon: Lightbulb,      label: '웹 인사이트',    category: '웹인사이트' },
  { id: 'opinion',     Icon: MessageSquare,  label: '오피니언 채널',  category: '오피니언' },
  { id: 'newsletter',  Icon: Mail,           label: '뉴스레터',       category: '뉴스레터' },
  { id: 'ai-report',   Icon: Bot,            label: 'AI 보고서',      category: 'AI보고서' },
  { id: 'youtube',     Icon: Play,           label: '유튜브 영상',    category: null },
]

interface Props {
  activeService?: string
}

export default function CategoryGrid({ activeService = 'all' }: Props) {
  const [todayCounts, setTodayCounts]  = useState<Record<string, number>>({})
  const [totalCounts, setTotalCounts]  = useState<Record<string, number>>({})
  const [totalLoaded, setTotalLoaded]  = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // 오늘 업데이트 수 + 전체 보유 수를 한 번의 쿼리로 조회
    Promise.all([
      supabase
        .from('contents')
        .select('category, collected_at')
        .eq('status', 'published')
        .gte('collected_at', todayStartKstIso()),
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

  const svcSuffix = activeService !== 'all' ? `?service=${activeService}` : ''

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
      {CATEGORY_DEFS.map((cat) => {
        const href =
          cat.category === null
            ? `/dashboard/youtube${svcSuffix}`
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}${activeService !== 'all' ? `&service=${activeService}` : ''}`

        const today = cat.category ? (todayCounts[cat.category] ?? 0) : 0
        const total = cat.category ? (totalCounts[cat.category] ?? 0) : 0
        const isEmpty = totalLoaded && cat.category !== null && total === 0

        return (
          <Link
            key={cat.id}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              isEmpty
                ? 'border-border bg-muted text-muted-foreground/50 hover:border-border hover:text-muted-foreground/50'
                : 'border-border bg-card text-foreground hover:border-brand-200 hover:text-brand-600 hover:shadow-sm dark:hover:border-brand-700/50'
            }`}
            title={isEmpty ? '콘텐츠 준비 중' : undefined}
          >
            <cat.Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{cat.label}</span>
            {today > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {today}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
