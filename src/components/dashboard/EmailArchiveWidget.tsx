'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Mail, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ArchiveRow {
  id: string
  name: string
  itemCount: number
}

export default function EmailArchiveWidget() {
  const [archives, setArchives] = useState<ArchiveRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [result, setResult]       = useState<{ id: string; to: string } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [emailInputId, setEmailInputId] = useState<string | null>(null)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const loadArchives = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setUserEmail(user.email)

      const { data } = await supabase
        .from('archives')
        .select('id, name, archive_items(added_at)')
        .order('created_at', { ascending: false })

      const rows = (data ?? []).map((a: { id: string; name: string; archive_items: unknown[] }) => ({
        id: a.id,
        name: a.name,
        itemCount: Array.isArray(a.archive_items) ? a.archive_items.length : 0,
      }))
      setArchives(rows)
      setLoading(false)
    }

    loadArchives()
    window.addEventListener('archive:changed', loadArchives)
    return () => window.removeEventListener('archive:changed', loadArchives)
  }, [])

  async function handleSend(archiveId: string, recipientsInput?: string) {
    setSendingId(archiveId)
    setError(null)
    setResult(null)
    const recipients = recipientsInput
      ? recipientsInput.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
      : []
    try {
      const res = await fetch('/api/email/send-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId, recipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setResult({ id: archiveId, to: data.to })
      setEmailInputId(null)
      setEmailInputValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSendingId(null)
    }
  }

  if (!loading && archives.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          콘텐츠를 아카이빙하면 메일로 받아볼 수 있어요
        </p>
        <Link
          href="/dashboard/mypage"
          className="ml-4 shrink-0 text-xs font-medium text-brand-600 hover:underline"
        >
          아카이브 관리 →
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
            <h2 className="text-sm font-semibold text-foreground">아카이빙 콘텐츠 메일로 받기</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            담아둔 아카이브를 골라 이메일로 바로 보내보세요
          </p>
        </div>
        <Link
          href="/dashboard/mypage"
          className="shrink-0 text-xs text-brand-600 hover:underline"
        >
          아카이브 관리
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 w-44 shrink-0 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {archives.map((a) => (
            <div
              key={a.id}
              className="flex w-48 shrink-0 flex-col justify-between rounded-xl border border-brand-100 bg-card px-3 py-2.5"
            >
              <div>
                <p className="truncate text-xs font-medium text-foreground">{a.name}</p>
                <span className="text-[10px] text-muted-foreground">{a.itemCount}건</span>
              </div>
              <button
                onClick={() => {
                  if (emailInputId === a.id) {
                    setEmailInputId(null)
                  } else {
                    setEmailInputId(a.id)
                    setEmailInputValue(userEmail)
                    setResult(null)
                    setError(null)
                  }
                }}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-brand-solid px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-solid-hover"
              >
                <Mail className="h-3.5 w-3.5" />
                이메일로 받기
              </button>
              {emailInputId === a.id && (
                <div className="mt-2 flex items-center gap-1">
                  <input
                    type="text"
                    value={emailInputValue}
                    onChange={(e) => setEmailInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSend(a.id, emailInputValue)
                      }
                    }}
                    placeholder="수신 이메일"
                    className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                  <button
                    onClick={() => handleSend(a.id, emailInputValue)}
                    disabled={sendingId === a.id || !emailInputValue.trim()}
                    className="h-7 shrink-0 rounded bg-brand-solid px-2 text-[11px] font-medium text-white hover:bg-brand-solid-hover disabled:opacity-60"
                  >
                    {sendingId === a.id ? '...' : '발송'}
                  </button>
                  <button
                    onClick={() => setEmailInputId(null)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-positive-soft px-3 py-2 text-xs text-positive">
          {result.to} 으로 발송되었습니다.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
