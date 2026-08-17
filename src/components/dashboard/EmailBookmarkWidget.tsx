'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Mail, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/** 517 — 아카이브가 북마크로 통합되며 EmailArchiveWidget(그룹 단위 발송)도 함께
 *  전환. 북마크는 그룹 없는 평면 목록이라 "전체 북마크를 이메일로 받기" 하나로 단순화. */
export default function EmailBookmarkWidget() {
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [emailInputOpen, setEmailInputOpen] = useState(false)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const loadBookmarks = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setUserEmail(user.email)

      const { data } = await supabase
        .from('bookmarks')
        .select('id')
        .order('created_at', { ascending: false })

      setBookmarkIds((data ?? []).map((row: { id: string }) => row.id))
      setLoading(false)
    }

    loadBookmarks()
  }, [])

  async function handleSend() {
    setSending(true)
    setError(null)
    setResult(null)
    const recipients = emailInputValue
      ? emailInputValue.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
      : []
    try {
      const res = await fetch('/api/email/send-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkIds, recipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setResult(data.to)
      setEmailInputOpen(false)
      setEmailInputValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSending(false)
    }
  }

  if (!loading && bookmarkIds.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          콘텐츠를 북마크하면 메일로 받아볼 수 있어요
        </p>
        <Link
          href="/dashboard/mypage#bookmarks"
          className="ml-4 shrink-0 text-xs font-medium text-brand-600 hover:underline"
        >
          북마크 관리 →
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-pink-50 dark:from-card dark:to-card px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Mail className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-foreground">북마크 메일로 받기</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {loading ? '불러오는 중...' : `담아둔 북마크 ${bookmarkIds.length}건을 이메일로 바로 보내보세요`}
          </p>
        </div>
        <Link
          href="/dashboard/mypage#bookmarks"
          className="shrink-0 text-xs text-brand-600 hover:underline"
        >
          북마크 관리
        </Link>
      </div>

      {!loading && (
        <button
          onClick={() => {
            if (emailInputOpen) {
              setEmailInputOpen(false)
            } else {
              setEmailInputOpen(true)
              setEmailInputValue(userEmail)
              setResult(null)
              setError(null)
            }
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-solid px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-solid-hover"
        >
          <Mail className="h-3.5 w-3.5" />
          전체 북마크 메일로 받기
        </button>
      )}

      {emailInputOpen && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={emailInputValue}
            onChange={(e) => setEmailInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="수신 이메일"
            className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <button
            onClick={handleSend}
            disabled={sending || !emailInputValue.trim()}
            className="h-8 shrink-0 rounded bg-brand-solid px-3 text-xs font-medium text-white hover:bg-brand-solid-hover disabled:opacity-60"
          >
            {sending ? '...' : '발송'}
          </button>
          <button
            onClick={() => setEmailInputOpen(false)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-positive-soft px-3 py-2 text-xs text-positive">
          {result} 으로 발송되었습니다.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
