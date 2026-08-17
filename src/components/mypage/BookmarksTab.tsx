'use client'

import Link from 'next/link'
import { Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BookmarkWithItem } from './types'

interface Props {
  bookmarks: BookmarkWithItem[]
  loading: boolean
  error: string | null
  onRemove: (bookmarkId: string) => void
  selectedIds: Set<string>
  onToggleSelect: (bookmarkId: string) => void
  onToggleSelectAll: () => void
  emailInputOpen: boolean
  onOpenEmailInput: () => void
  onCloseEmailInput: () => void
  emailInputValue: string
  setEmailInputValue: (value: string) => void
  sending: boolean
  sendResult: { to: string } | null
  onSendEmail: () => void
}

function bookmarkTitleAndHref(bookmark: BookmarkWithItem): { title: string; href: string | null; external: boolean } | null {
  if (bookmark.contents) {
    return { title: bookmark.contents.title, href: `/dashboard/contents/${bookmark.contents.id}`, external: false }
  }
  if (bookmark.ai_reports) {
    return { title: bookmark.ai_reports.title, href: `/dashboard/reports/${bookmark.ai_reports.id}`, external: false }
  }
  if (bookmark.daily_insights) {
    return { title: bookmark.daily_insights.headline, href: `/dashboard/daily-insights/${bookmark.daily_insights.id}`, external: false }
  }
  if (bookmark.insight_cards) {
    return {
      title: bookmark.insight_cards.card_headline ?? bookmark.insight_cards.headline,
      href: `/dashboard/insights/${bookmark.insight_cards.id}`,
      external: false,
    }
  }
  if (bookmark.youtube_videos) {
    return { title: bookmark.youtube_videos.title, href: `https://www.youtube.com/watch?v=${bookmark.youtube_videos.video_id}`, external: true }
  }
  return null
}

function bookmarkMeta(bookmark: BookmarkWithItem): string {
  if (bookmark.contents) return bookmark.contents.category
  if (bookmark.ai_reports) return `AI 리포트 · ${bookmark.ai_reports.type}`
  if (bookmark.daily_insights) return bookmark.daily_insights.category ?? '핵심 인사이트'
  if (bookmark.insight_cards) return `인사이트 카드 · ${bookmark.insight_cards.topic}`
  if (bookmark.youtube_videos) return bookmark.youtube_videos.channel_name
  return '북마크'
}

function bookmarkDate(bookmark: BookmarkWithItem): string {
  const date =
    bookmark.contents?.published_at
    ?? bookmark.youtube_videos?.published_at
    ?? bookmark.ai_reports?.published_at
    ?? bookmark.daily_insights?.day_of
    ?? bookmark.insight_cards?.generated_at
    ?? bookmark.created_at
  return new Date(date).toLocaleDateString('ko-KR')
}

export default function BookmarksTab({
  bookmarks,
  loading,
  error,
  onRemove,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  emailInputOpen,
  onOpenEmailInput,
  onCloseEmailInput,
  emailInputValue,
  setEmailInputValue,
  sending,
  sendResult,
  onSendEmail,
}: Props) {
  const allSelected = bookmarks.length > 0 && selectedIds.size === bookmarks.length

  return (
    <section id="bookmarks" className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">북마크</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            빠르게 다시 볼 콘텐츠·인사이트를 모아둔 목록입니다. 선택해서 이메일로 받아볼 수 있습니다.
          </p>
        </div>
        {bookmarks.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleSelectAll}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={emailInputOpen ? onCloseEmailInput : onOpenEmailInput}
              disabled={selectedIds.size === 0}
              className="h-7 text-xs"
            >
              <Mail className="mr-1 h-3.5 w-3.5" />
              선택 {selectedIds.size}건 메일로 받기
            </Button>
          </div>
        )}
      </div>

      {emailInputOpen && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <input
            type="text"
            value={emailInputValue}
            onChange={(e) => setEmailInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSendEmail()
              }
            }}
            placeholder="수신 이메일 (쉼표로 여러 명)"
            className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <Button
            type="button"
            size="sm"
            onClick={onSendEmail}
            disabled={sending || !emailInputValue.trim()}
            className="h-8 bg-brand-solid px-3 text-xs text-white hover:bg-brand-solid-hover"
          >
            {sending ? '발송 중...' : '발송'}
          </Button>
          <button
            type="button"
            onClick={onCloseEmailInput}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {sendResult && (
        <p className="mb-3 rounded-lg bg-positive-soft px-3 py-2 text-xs text-positive">
          {sendResult.to} 으로 발송되었습니다.
        </p>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : bookmarks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 저장한 북마크가 없습니다. 콘텐츠·인사이트 상세 페이지에서 &quot;북마크&quot;를 눌러 보세요.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {bookmarks.map((bookmark) => {
            const resolved = bookmarkTitleAndHref(bookmark)

            return (
              <div key={bookmark.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(bookmark.id)}
                    onChange={() => onToggleSelect(bookmark.id)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-border text-brand-600 focus:ring-brand-600"
                  />
                  <div className="min-w-0 flex-1">
                    {resolved ? (
                      <Link
                        href={resolved.href!}
                        prefetch={false}
                        target="_blank"
                        rel="noopener"
                        className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                      >
                        {resolved.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">(삭제된 항목)</span>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bookmarkMeta(bookmark)} · {bookmarkDate(bookmark)}
                    </p>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => onRemove(bookmark.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-400"
                  title="북마크 해제"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-negative">{error}</p>}
    </section>
  )
}
