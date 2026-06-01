'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

interface PickItem {
  id: string
  title: string
  category: ContentCategory
  published_at: string | null
  sources: { name: string } | null
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export default function EditorPick() {
  const [items, setItems]     = useState<PickItem[]>([])
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contents')
      .select('id, title, category, published_at, sources(name)')
      .eq('is_published', true)
      .eq('is_editor_pick', true)
      .order('published_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        setItems((data ?? []) as unknown as PickItem[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h2 className="text-sm font-semibold text-gray-900">에디터 픽</h2>
        </div>
        <Link
          href="/dashboard/contents?is_editor_pick=true"
          className="text-xs text-brand-600 hover:underline"
        >
          전체 보기
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="h-7 w-12 shrink-0 rounded-lg bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-3/4 rounded bg-gray-100" />
                <div className="h-3 w-1/2 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-xs text-gray-400">
          에디터 픽 콘텐츠가 없습니다
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="group -mx-1 flex cursor-pointer gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-7 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[10px] font-bold text-white">
                PICK {String(idx + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900 group-hover:text-brand-600">
                  {item.title}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                    {CONTENT_CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                  {item.sources?.name && <span>{item.sources.name}</span>}
                  {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
