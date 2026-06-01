'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ContentCategory } from '@/lib/types'

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
  'flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-center transition-all hover:border-brand-200 hover:shadow-sm group'

interface Props {
  activeService?: string
}

export default function CategoryGrid({ activeService = 'all' }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  // 카테고리별 실제 콘텐츠 건수 로드
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contents')
      .select('category')
      .eq('is_published', true)
      .then(({ data }) => {
        if (!data) return
        const c: Record<string, number> = {}
        for (const row of data) {
          c[row.category] = (c[row.category] ?? 0) + 1
        }
        setCounts(c)
      })
  }, [])

  const svcSuffix = activeService !== 'all' ? `?service=${activeService}` : ''

  return (
    <div className="grid grid-cols-8 gap-3">
      {CATEGORY_DEFS.map((cat) => {
        // 유튜브는 기존 별도 페이지로
        const href =
          cat.category === null
            ? `/dashboard/youtube${svcSuffix}`
            : `/dashboard/contents?category=${encodeURIComponent(cat.category)}${activeService !== 'all' ? `&service=${activeService}` : ''}`

        const count = cat.category ? (counts[cat.category] ?? 0) : 0

        const inner = (
          <>
            <div className="relative">
              <span className="text-2xl">{cat.icon}</span>
              {count > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </div>
            <span className="text-xs font-medium leading-tight text-gray-700 group-hover:text-brand-600">
              {cat.label}
            </span>
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
