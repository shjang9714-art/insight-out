'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import type { BookmarkWithItem } from './types'

interface Props {
  bookmarks: BookmarkWithItem[]
  loading: boolean
  error: string | null
  onRemove: (bookmarkId: string) => void
}

export default function BookmarksTab({ bookmarks, loading, error, onRemove }: Props) {
  return (
    <section id="bookmarks" className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">북마크</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          빠르게 다시 볼 콘텐츠와 영상을 모아둔 목록입니다.
        </p>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : bookmarks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 저장한 북마크가 없습니다. 콘텐츠 상세 페이지에서 &quot;북마크&quot;를 눌러 보세요.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {bookmarks.map((bookmark) => {
            const content = bookmark.contents
            const video = bookmark.youtube_videos
            const youtubeUrl = video ? `https://www.youtube.com/watch?v=${video.video_id}` : null
            const date = content?.published_at ?? video?.published_at ?? bookmark.created_at

            return (
              <div key={bookmark.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {content ? (
                    <Link
                      href={`/dashboard/contents/${content.id}`}
                      prefetch={false}
                      className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                    >
                      {content.title}
                    </Link>
                  ) : video && youtubeUrl ? (
                    <a
                      href={youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                    >
                      {video.title}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">(삭제된 항목)</span>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {content?.category ?? video?.channel_name ?? '북마크'} · {new Date(date).toLocaleDateString('ko-KR')}
                  </p>
                </div>
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
