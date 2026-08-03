'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileDown, Pencil, Save, Trash2, X } from 'lucide-react'
import type { KnowledgeReportAdminItem } from '@/lib/knowledge-reports/admin'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface KnowledgeReportListProps {
  reports: KnowledgeReportAdminItem[]
  onUpdated: (report: KnowledgeReportAdminItem) => void
  onDeleted: (id: string) => void
}

interface EditDraft {
  title: string
  summary: string
  keywords: string
}

export default function KnowledgeReportList({ reports, onUpdated, onDeleted }: KnowledgeReportListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ title: '', summary: '', keywords: '' })
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startEditing = (report: KnowledgeReportAdminItem) => {
    setEditingId(report.id)
    setDraft({
      title: report.title,
      summary: report.summary_ko ?? '',
      keywords: report.matched_keywords.join(', '),
    })
    setError(null)
  }

  const save = async (id: string) => {
    setPendingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/knowledge-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          summary: draft.summary,
          keywords: draft.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
        }),
      })
      const result = await response.json() as { report?: KnowledgeReportAdminItem; error?: string }
      if (!response.ok || !result.report) throw new Error(result.error ?? '수정하지 못했습니다.')
      onUpdated(result.report)
      setEditingId(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '수정 중 오류가 발생했습니다.')
    } finally {
      setPendingId(null)
    }
  }

  const remove = async (report: KnowledgeReportAdminItem) => {
    if (!window.confirm(`“${report.title}”을 목록에서 삭제할까요? 파일은 보관됩니다.`)) return
    setPendingId(report.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/knowledge-reports/${report.id}`, { method: 'DELETE' })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error ?? '삭제하지 못했습니다.')
      onDeleted(report.id)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '삭제 중 오류가 발생했습니다.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">등록된 지식보고서</h2>
        <p className="mt-1 text-xs text-muted-foreground">삭제는 사용자 목록에서만 내리는 소프트 삭제로 처리됩니다.</p>
      </div>
      {error && <AdminErrorBox>{error}</AdminErrorBox>}
      {reports.length === 0 ? (
        <AdminEmptyState icon={FileDown} message="아직 등록된 지식보고서가 없습니다." />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const editing = editingId === report.id
            const extension = report.file_path?.split('.').pop()?.toUpperCase() ?? '파일'
            return (
              <article key={report.id} className="rounded-xl border border-border bg-card p-4">
                {editing ? (
                  <div className="space-y-3">
                    <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-label="지식보고서 제목" />
                    <textarea
                      value={draft.summary}
                      onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                      rows={3}
                      aria-label="지식보고서 요약"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
                    />
                    <Input value={draft.keywords} onChange={(event) => setDraft((current) => ({ ...current, keywords: event.target.value }))} placeholder="키워드를 쉼표로 구분" aria-label="지식보고서 키워드" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => save(report.id)} disabled={pendingId === report.id}>
                        <Save aria-hidden /> 저장
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X aria-hidden /> 취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{extension}</span>
                        <Link href={`/dashboard/contents/${report.id}?category=${encodeURIComponent('지식보고서')}`} prefetch={false} target="_blank" rel="noopener" className="font-semibold text-foreground hover:text-brand-600">
                          {report.title}
                        </Link>
                      </div>
                      {report.summary_ko && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{report.summary_ko}</p>}
                      {report.matched_keywords.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">{report.matched_keywords.map((keyword) => `#${keyword}`).join(' ')}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEditing(report)}>
                        <Pencil aria-hidden /> 편집
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(report)} disabled={pendingId === report.id} className="text-negative hover:text-negative">
                        <Trash2 aria-hidden /> 삭제
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
