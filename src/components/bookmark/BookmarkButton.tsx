'use client'

import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface BookmarkButtonProps {
  contentId?: string
  youtubeVideoId?: string
}

function isDuplicateError(error: { code?: string; message?: string }) {
  return error.code === '23505' || error.message?.includes('duplicate key')
}

export default function BookmarkButton({
  contentId,
  youtubeVideoId,
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasTarget = Boolean(contentId || youtubeVideoId)

  useEffect(() => {
    if (!hasTarget) return

    let cancelled = false

    const loadBookmark = async () => {
      const supabase = createClient()
      setLoading(true)
      setError(null)

      let query = supabase.from('bookmarks').select('id').limit(1)
      query = contentId
        ? query.eq('content_id', contentId)
        : query.eq('youtube_video_id', youtubeVideoId!)

      const { data, error: fetchError } = await query

      if (cancelled) return
      if (fetchError) {
        setError('북마크 상태를 불러오지 못했습니다.')
      } else {
        setIsBookmarked((data ?? []).length > 0)
      }
      setLoading(false)
    }

    void loadBookmark()

    return () => {
      cancelled = true
    }
  }, [contentId, youtubeVideoId, hasTarget])

  if (!hasTarget) return null

  const handleToggle = async () => {
    if (saving) return

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const nextState = !isBookmarked
    setIsBookmarked(nextState)

    try {
      if (nextState) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('로그인이 필요합니다.')

        const { error: insertError } = await supabase.from('bookmarks').insert({
          user_id: user.id,
          content_id: contentId ?? null,
          youtube_video_id: contentId ? null : (youtubeVideoId ?? null),
        })

        if (insertError && !isDuplicateError(insertError)) {
          throw insertError
        }
      } else {
        let query = supabase.from('bookmarks').delete()
        query = contentId
          ? query.eq('content_id', contentId)
          : query.eq('youtube_video_id', youtubeVideoId!)

        const { error: deleteError } = await query
        if (deleteError) throw deleteError
      }
    } catch (toggleError) {
      setIsBookmarked(!nextState)
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : '북마크 저장 중 오류가 발생했습니다.'
      )
    } finally {
      setSaving(false)
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading || saving}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          isBookmarked
            ? 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'
            : 'border-gray-200 bg-white text-gray-600 hover:border-brand-600 hover:text-brand-600'
        )}
      >
        {saving || loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isBookmarked ? (
          <BookmarkCheck className="h-4 w-4" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
        {isBookmarked ? '북마크됨' : '북마크'}
      </button>

      {error && (
        <p className="absolute right-0 top-11 z-20 w-56 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs text-red-500 shadow-sm">
          {error}
        </p>
      )}
    </div>
  )
}
