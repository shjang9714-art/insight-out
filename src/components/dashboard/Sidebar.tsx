'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { RECENT_VIEWS } from './mock-data'

interface Props {
  onClose?: () => void
}

interface ArchivedItem {
  id: string
  title: string
  category: string | null
  addedAt: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function Sidebar({ onClose }: Props) {
  const [archived, setArchived] = useState<ArchivedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('archives')
      .select('archive_items(added_at, contents(id, title, category))')
      .then(({ data }) => {
        const items: ArchivedItem[] = []
        for (const archive of (data ?? []) as unknown as {
          archive_items: {
            added_at: string
            contents: { id: string; title: string; category: string | null } | null
          }[]
        }[]) {
          for (const ai of archive.archive_items ?? []) {
            if (ai.contents) {
              items.push({
                id: ai.contents.id,
                title: ai.contents.title,
                category: ai.contents.category,
                addedAt: ai.added_at,
              })
            }
          }
        }
        items.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt))
        // 중복 콘텐츠 제거
        const seen = new Set<string>()
        const unique = items.filter((it) => {
          if (seen.has(it.id)) return false
          seen.add(it.id)
          return true
        })
        setArchived(unique.slice(0, 8))
        setLoading(false)
      })
  }, [])

  return (
    <aside className="w-56 shrink-0 border-r border-gray-100 bg-white">
      <div className="sticky top-14 h-[calc(100vh-56px)] space-y-5 overflow-y-auto px-3 py-4">

        {/* 아카이빙 콘텐츠 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              아카이빙 콘텐츠
            </h3>
            <Link
              href="/dashboard/mypage"
              onClick={() => onClose?.()}
              className="text-[10px] text-brand-600 hover:underline"
            >
              전체
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : archived.length === 0 ? (
            <p className="px-2 text-[11px] leading-relaxed text-gray-400">
              담아둔 콘텐츠가 없습니다. 콘텐츠 상세에서 &quot;아카이빙 담기&quot;를 눌러 보세요.
            </p>
          ) : (
            <div className="space-y-0.5">
              {archived.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/contents/${item.id}`}
                  onClick={() => onClose?.()}
                  className="block w-full rounded-lg px-2 py-2 transition-colors hover:bg-brand-50"
                >
                  <p className="line-clamp-2 text-xs leading-snug text-gray-700">{item.title}</p>
                  <span className="mt-0.5 inline-block text-[10px] text-gray-400">
                    {item.category ? `${item.category} · ` : ''}{formatDate(item.addedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-gray-100" />

        {/* 최근 본 항목 */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            최근 본 항목
          </h3>
          <div className="space-y-0.5">
            {RECENT_VIEWS.map((item) => (
              <div
                key={item.id}
                title="상세 보기 곧 제공"
                className="w-full rounded-lg px-2 py-2 cursor-default"
              >
                <p className="line-clamp-2 text-xs leading-snug text-gray-700">{item.title}</p>
                <span className="mt-0.5 inline-block text-[10px] text-gray-400">{item.time}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
