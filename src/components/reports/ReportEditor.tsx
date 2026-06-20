'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Save, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { AiReportStatus } from '@/lib/types'
import ReportMarkdown from '@/components/reports/ReportMarkdown'

const STATUS_OPTIONS: { value: AiReportStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'completed', label: '완료' },
]

interface Props {
  reportId: string
  initialTitle: string
  initialBodyMd: string | null
  initialStatus: AiReportStatus
}

export default function ReportEditor({ reportId, initialTitle, initialBodyMd, initialStatus }: Props) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [bodyMd, setBodyMd] = useState(initialBodyMd ?? '')
  const [status, setStatus] = useState<AiReportStatus>(initialStatus)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmed = bodyMd.trim()
    if (trimmed.length > 100000) {
      setError('본문이 너무 깁니다. 10만자 이하로 줄여주세요.')
      return
    }
    setIsSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('ai_reports')
      .update({
        title: title.trim() || initialTitle,
        body_md: trimmed || null,
        status,
      })
      .eq('id', reportId)

    if (err) {
      console.error('[ReportEditor] save error:', err)
      setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setIsSaving(false)
      return
    }

    setIsSaving(false)
    setIsEditing(false)
    router.refresh()
  }

  const handleCancel = () => {
    setTitle(initialTitle)
    setBodyMd(initialBodyMd ?? '')
    setStatus(initialStatus)
    setError(null)
    setIsEditing(false)
  }

  if (!isEditing) {
    return (
      <div>
        {/* 편집 버튼 — 인쇄 시 숨김 */}
        <div className="print:hidden mb-4 flex justify-end">
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-brand-600/40 hover:text-brand-600 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            편집
          </button>
        </div>

        {/* 본문 렌더 */}
        {bodyMd ? (
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <ReportMarkdown>{bodyMd}</ReportMarkdown>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            보고서 본문이 없습니다.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 print:hidden">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">상태</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AiReportStatus)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              isSaving
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-brand-600 text-white hover:bg-brand-700',
            )}
          >
            {isSaving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />
            }
            저장
          </button>
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
        />
      </div>

      {/* 본문 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">본문 (Markdown)</label>
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={24}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-600/30 resize-y"
          placeholder="보고서 본문을 마크다운으로 작성하세요…"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
