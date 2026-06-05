'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ArchiveRow {
  id: string
  name: string
  itemCount: number
}

export default function EmailArchiveWidget() {
  const [archives, setArchives] = useState<ArchiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; to: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('archives')
      .select('id, name, archive_items(content_id)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []).map((a: { id: string; name: string; archive_items: unknown[] }) => ({
          id: a.id,
          name: a.name,
          itemCount: Array.isArray(a.archive_items) ? a.archive_items.length : 0,
        }))
        setArchives(rows)
        setLoading(false)
      })
  }, [])

  async function handleSend(archiveId: string) {
    setSendingId(archiveId)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/email/send-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setResult({ id: archiveId, to: data.to })
    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-pink-50 px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">📩</span>
            <h2 className="text-sm font-semibold text-gray-900">아카이빙 콘텐츠 메일로 받기</h2>
          </div>
          <p className="text-xs text-gray-500">
            담아둔 아카이브를 골라 등록된 이메일로 바로 보내보세요
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
            <div key={i} className="h-16 w-44 shrink-0 animate-pulse rounded-xl bg-white/60" />
          ))}
        </div>
      ) : archives.length === 0 ? (
        <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-5 text-center text-xs text-gray-500">
          아직 담아둔 아카이브가 없습니다. 콘텐츠 상세에서 &quot;아카이빙 담기&quot;를 눌러 보세요.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {archives.map((a) => (
            <div
              key={a.id}
              className="flex w-48 shrink-0 flex-col justify-between rounded-xl border border-brand-100 bg-white px-3 py-2.5"
            >
              <div>
                <p className="truncate text-xs font-medium text-gray-800">{a.name}</p>
                <span className="text-[10px] text-gray-400">{a.itemCount}건</span>
              </div>
              <button
                onClick={() => handleSend(a.id)}
                disabled={sendingId === a.id}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                {sendingId === a.id ? '발송 중...' : '이메일로 받기'}
              </button>
            </div>
          ))}
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600">
          {result.to} 으로 발송되었습니다.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
