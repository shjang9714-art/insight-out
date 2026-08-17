'use client'

import { useEffect, useState } from 'react'
import BackLink from '@/components/BackLink'
import { createClient } from '@/lib/supabase/client'
import PageContainer from '@/components/PageContainer'
import BookmarksTab from '@/components/mypage/BookmarksTab'
import type { BookmarkWithItem } from '@/components/mypage/types'

// 492 · 3단계 D — 소프트 삭제된 콘텐츠는 "삭제된 콘텐츠" 표시 없이 목록에서 조용히 감춘다.
// SQL B(RLS) 적용 후에는 contents 가 null 로 오지만, 그 전(또는 admin 조회 등)에는
// deleted_at 이 채워진 채로 올 수 있어 두 경우 다 걸러야 카운트·목록이 어긋나지 않는다.
type ContentsJoin = { deleted_at?: string | null } | null

function isLiveContentJoin(contentId: string | null, contents: ContentsJoin): boolean {
  if (!contentId) return true // youtube_video_id/ai_report_id 기반 항목은 무관
  return Boolean(contents) && !contents!.deleted_at
}

function filterDeletedBookmarks(rows: BookmarkWithItem[]): BookmarkWithItem[] {
  return rows.filter((row) => isLiveContentJoin(row.content_id, row.contents as ContentsJoin))
}

export default function BookmarksPage() {
  const supabase = createClient()

  const [bookmarks, setBookmarks] = useState<BookmarkWithItem[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(true)
  const [bookmarkError, setBookmarkError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setBookmarksLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('bookmarks')
        .select(`
          id, content_id, youtube_video_id, ai_report_id, created_at,
          contents(id, title, category, original_url, published_at, deleted_at),
          youtube_videos(id, video_id, title, channel_name, published_at),
          ai_reports(id, title, type, published_at)
        `)
        .order('created_at', { ascending: false })

      if (error) setBookmarkError('북마크를 불러오지 못했습니다.')
      if (data) setBookmarks(filterDeletedBookmarks(data as unknown as BookmarkWithItem[]))
      setBookmarksLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRemoveBookmark(bookmarkId: string) {
    setBookmarkError(null)
    const { error } = await supabase.from('bookmarks').delete().eq('id', bookmarkId)
    if (error) {
      setBookmarkError('북마크 해제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== bookmarkId))
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <BackLink
            fallbackHref="/dashboard"
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          />
          <h1 className="text-xl font-bold text-foreground">북마크</h1>
          <p className="mt-1 text-sm text-muted-foreground">빠르게 다시 볼 콘텐츠와 영상을 모아둔 목록입니다.</p>
        </div>

        <BookmarksTab
          bookmarks={bookmarks}
          loading={bookmarksLoading}
          error={bookmarkError}
          onRemove={handleRemoveBookmark}
        />
      </div>
    </PageContainer>
  )
}
