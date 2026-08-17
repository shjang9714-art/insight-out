'use client'

import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface BookmarkButtonProps {
  contentId?: string
  youtubeVideoId?: string
  reportId?: string
  dailyInsightId?: string
  insightCardId?: string
}

type BookmarkColumn = 'content_id' | 'ai_report_id' | 'youtube_video_id' | 'daily_insight_id' | 'insight_card_id'
type BookmarkTarget = { column: BookmarkColumn; id: string }

function resolveTarget(
  contentId?: string,
  reportId?: string,
  youtubeVideoId?: string,
  dailyInsightId?: string,
  insightCardId?: string
): BookmarkTarget | null {
  if (contentId) return { column: 'content_id', id: contentId }
  if (reportId) return { column: 'ai_report_id', id: reportId }
  if (youtubeVideoId) return { column: 'youtube_video_id', id: youtubeVideoId }
  if (dailyInsightId) return { column: 'daily_insight_id', id: dailyInsightId }
  if (insightCardId) return { column: 'insight_card_id', id: insightCardId }
  return null
}

function isDuplicateError(error: { code?: string; message?: string }) {
  return error.code === '23505' || error.message?.includes('duplicate key')
}

export default function BookmarkButton({
  contentId,
  youtubeVideoId,
  reportId,
  dailyInsightId,
  insightCardId,
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = resolveTarget(contentId, reportId, youtubeVideoId, dailyInsightId, insightCardId)
  const targetColumn = target?.column ?? null
  const targetId = target?.id ?? null

  useEffect(() => {
    if (!targetColumn || !targetId) return

    let cancelled = false

    const loadBookmark = async () => {
      const supabase = createClient()
      setLoading(true)
      setError(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!cancelled) {
          setIsBookmarked(false)
          setLoading(false)
        }
        return
      }

      const { data, error: fetchError } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq(targetColumn, targetId)
        .limit(1)

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
  }, [targetColumn, targetId])

  if (!target) return null

  const handleToggle = async () => {
    if (saving) return

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const nextState = !isBookmarked
    setIsBookmarked(nextState)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인이 필요합니다.')

      if (nextState) {
        const { error: insertError } = await supabase.from('bookmarks').insert({
          user_id: user.id,
          [target.column]: target.id,
        })

        if (insertError && !isDuplicateError(insertError)) {
          throw insertError
        }
      } else {
        const { error: deleteError } = await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq(target.column, target.id)

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
            : 'border-border bg-card text-muted-foreground hover:border-brand-600 hover:text-brand-600'
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
        <p className="absolute right-0 top-11 z-20 w-56 rounded-lg border border-red-100 bg-card px-3 py-2 text-xs text-red-500 shadow-sm">
          {error}
        </p>
      )}
    </div>
  )
}
