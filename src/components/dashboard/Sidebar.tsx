'use client'

import { useState, useEffect, startTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getRecentViews, type RecentView } from '@/lib/recent-views'

interface Props {
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
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

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}일 전`
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }: Props) {
  const [archived, setArchived]       = useState<ArchivedItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [recentViews, setRecentViews] = useState<RecentView[]>([])

  useEffect(() => {
    const supabase = createClient()

    const loadArchives = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('archives')
        .select('archive_items(added_at, contents(id, title, category))')
        .eq('user_id', user.id)

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
      const seen = new Set<string>()
      const unique = items.filter((it) => {
        if (seen.has(it.id)) return false
        seen.add(it.id)
        return true
      })
      setArchived(unique.slice(0, 8))
      setLoading(false)
    }

    loadArchives()
    window.addEventListener('archive:changed', loadArchives)
    return () => window.removeEventListener('archive:changed', loadArchives)
  }, [])

  useEffect(() => {
    startTransition(() => setRecentViews(getRecentViews()))

    const reload = () => startTransition(() => setRecentViews(getRecentViews()))
    window.addEventListener('recent-views:changed', reload)
    window.addEventListener('storage', reload)
    return () => {
      window.removeEventListener('recent-views:changed', reload)
      window.removeEventListener('storage', reload)
    }
  }, [])

  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 border-r border-border bg-card">
        <div className="sticky top-14 flex h-[calc(100vh-56px)] flex-col items-center py-4">
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="사이드바 펼치기"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card">
      <div className="sticky top-14 h-[calc(100vh-56px)] space-y-5 overflow-y-auto px-3 py-4">

        {/* 접기 버튼 */}
        {onToggleCollapse && (
          <div className="flex justify-end">
            <button
              onClick={onToggleCollapse}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="사이드바 접기"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 아카이빙 콘텐츠 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : archived.length === 0 ? (
            <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
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
                  <p className="line-clamp-2 text-xs leading-snug text-foreground/90">{item.title}</p>
                  <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">
                    {item.category ? `${item.category} · ` : ''}{formatDate(item.addedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* AI 분석 */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI 분석
          </h3>
          <Link
            href="/dashboard/ai-analysis"
            onClick={() => onClose?.()}
            className="flex items-center gap-1.5 w-full rounded-lg px-2 py-2 text-xs text-foreground/90 transition-colors hover:bg-brand-50"
          >
            <Sparkles className="h-3 w-3 text-brand-600 shrink-0" />
            AI 인사이트
          </Link>
          <Link
            href="/dashboard/ai-analysis?tab=issues"
            onClick={() => onClose?.()}
            className="flex items-center w-full rounded-lg px-2 py-1.5 pl-5 text-xs text-muted-foreground transition-colors hover:bg-brand-50 hover:text-foreground"
          >
            이슈
          </Link>
          <Link
            href="/dashboard/ai-analysis?tab=entities"
            onClick={() => onClose?.()}
            className="flex items-center w-full rounded-lg px-2 py-1.5 pl-5 text-xs text-muted-foreground transition-colors hover:bg-brand-50 hover:text-foreground"
          >
            지식그래프
          </Link>
        </section>

        <div className="border-t border-border" />

        {/* 지난 브리핑 */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            모닝브리핑
          </h3>
          <Link
            href="/dashboard/briefings"
            onClick={() => onClose?.()}
            className="block w-full rounded-lg px-2 py-2 text-xs text-foreground/90 transition-colors hover:bg-brand-50"
          >
            지난 브리핑
          </Link>
        </section>

        <div className="border-t border-border" />

        {/* 최근 본 항목 */}
        <section>
          <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            최근 본 항목
          </h3>
          {recentViews.length === 0 ? (
            <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
              최근 본 콘텐츠가 없습니다.
            </p>
          ) : (
            <div className="space-y-0.5">
              {recentViews.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/contents/${item.id}`}
                  onClick={() => onClose?.()}
                  className="block w-full rounded-lg px-2 py-2 transition-colors hover:bg-brand-50"
                >
                  <p className="line-clamp-2 text-xs leading-snug text-foreground/90">{item.title}</p>
                  <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">
                    {item.category ? `${item.category} · ` : ''}{timeAgo(item.viewedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
