'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { COMPETITOR_WEEKLY_STATUS_TONE } from '@/lib/admin/status-style'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import type { CompetitorWeeklySection } from '@/lib/competitor-weekly/query'

type CwrStatus = 'draft' | 'published' | 'archived'

export interface CompetitorWeeklyRow {
  id: string
  week_start: string
  week_end: string
  status: CwrStatus
  overall_impact: '위기' | '기회' | '관망' | null
  summary: string | null
  sections: CompetitorWeeklySection[]
  generated_at: string
}

const STATUS_LABELS: Record<CwrStatus, string> = {
  draft: '초안',
  published: '발행됨',
  archived: '보관',
}

const IMPACT_STYLE: Record<string, string> = {
  위기: 'bg-negative-soft text-negative',
  기회: 'bg-positive-soft text-positive',
  관망: 'bg-muted text-muted-foreground',
}

type PendingAction = 'save' | 'delete' | CwrStatus

export default function CompetitorWeeklyManager({ initialReports }: { initialReports: CompetitorWeeklyRow[] }) {
  const [reports, setReports] = useState<CompetitorWeeklyRow[]>(initialReports)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftSummary, setDraftSummary] = useState('')
  const [draftSections, setDraftSections] = useState('')
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<CompetitorWeeklyRow | null>(null)

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function startEdit(report: CompetitorWeeklyRow) {
    setEditingId(report.id)
    setDraftSummary(report.summary ?? '')
    setDraftSections(JSON.stringify(report.sections ?? [], null, 2))
    setSectionsError(null)
    clearRowError(report.id)
  }

  function cancelEdit() {
    setEditingId(null)
    setSectionsError(null)
  }

  async function saveEdit(report: CompetitorWeeklyRow) {
    let parsedSections: unknown
    try {
      parsedSections = JSON.parse(draftSections)
    } catch {
      setSectionsError('본문(JSON) 형식이 올바르지 않습니다.')
      return
    }
    if (!Array.isArray(parsedSections)) {
      setSectionsError('본문(JSON)은 배열이어야 합니다.')
      return
    }
    setSectionsError(null)

    setPendingId(report.id)
    setPendingAction('save')
    clearRowError(report.id)

    try {
      const response = await fetch(`/api/admin/competitor-weekly/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: draftSummary, sections: parsedSections }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !data.ok) {
        setRowErrors((prev) => ({ ...prev, [report.id]: data.error ?? '수정에 실패했습니다.' }))
        return
      }

      setReports((current) =>
        current.map((r) =>
          r.id === report.id
            ? { ...r, summary: draftSummary.trim() || null, sections: parsedSections as CompetitorWeeklySection[] }
            : r
        )
      )
      setEditingId(null)
    } catch {
      setRowErrors((prev) => ({ ...prev, [report.id]: '수정 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  async function changeStatus(report: CompetitorWeeklyRow, nextStatus: CwrStatus) {
    setPendingId(report.id)
    setPendingAction(nextStatus)
    clearRowError(report.id)

    try {
      const response = await fetch(`/api/admin/competitor-weekly/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !data.ok) {
        setRowErrors((prev) => ({ ...prev, [report.id]: data.error ?? '상태 변경에 실패했습니다.' }))
        return
      }

      setReports((current) =>
        current.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
      )
    } catch {
      setRowErrors((prev) => ({ ...prev, [report.id]: '상태 변경 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  async function confirmDelete() {
    const report = deleteTarget
    if (!report) return
    setDeleteTarget(null)

    setPendingId(report.id)
    setPendingAction('delete')
    clearRowError(report.id)

    try {
      const response = await fetch(`/api/admin/competitor-weekly/${report.id}`, { method: 'DELETE' })
      const data = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !data.ok) {
        setRowErrors((prev) => ({ ...prev, [report.id]: data.error ?? '삭제에 실패했습니다.' }))
        return
      }

      setReports((current) => current.filter((r) => r.id !== report.id))
    } catch {
      setRowErrors((prev) => ({ ...prev, [report.id]: '삭제 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  if (reports.length === 0) {
    return <AdminEmptyState message="아직 생성된 경쟁사 주간 브리핑이 없습니다." className="p-8" />
  }

  return (
    <>
    <div className="space-y-2">
      {reports.map((report) => {
        const isRowPending = pendingId === report.id
        const rowError = rowErrors[report.id]
        const isEditing = editingId === report.id
        const summaryPreview = report.summary ? stripLlmArtifacts(report.summary) : null

        return (
          <div key={report.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {report.week_start} ~ {report.week_end}
                  </span>
                  <StatusBadge tone={COMPETITOR_WEEKLY_STATUS_TONE[report.status]} label={STATUS_LABELS[report.status]} />
                  {report.overall_impact && (
                    <span className={cn('text-xs rounded px-1.5 py-0.5 font-medium', IMPACT_STYLE[report.overall_impact])}>
                      {report.overall_impact}
                    </span>
                  )}
                </div>
                {summaryPreview && !isEditing && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{summaryPreview}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isEditing && (
                  <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={() => startEdit(report)}>
                    <Pencil className="h-3.5 w-3.5" />
                    편집
                  </Button>
                )}

                {report.status === 'draft' && (
                  <Button type="button" size="sm" disabled={isRowPending} onClick={() => void changeStatus(report, 'published')}>
                    {isRowPending && pendingAction === 'published' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    발행
                  </Button>
                )}
                {report.status === 'published' && (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={() => void changeStatus(report, 'draft')}>
                      {isRowPending && pendingAction === 'draft' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      발행 취소
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={() => void changeStatus(report, 'archived')}>
                      {isRowPending && pendingAction === 'archived' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      보관
                    </Button>
                  </>
                )}
                {report.status === 'archived' && (
                  <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={() => void changeStatus(report, 'published')}>
                    {isRowPending && pendingAction === 'published' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    재발행
                  </Button>
                )}

                <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={() => setDeleteTarget(report)}>
                  {isRowPending && pendingAction === 'delete' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  삭제
                </Button>
              </div>
            </div>

            {rowError && (
              <div className="mt-3">
                <AdminErrorBox>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {rowError}
                  </div>
                </AdminErrorBox>
              </div>
            )}

            {isEditing && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`cwr-summary-${report.id}`} className="text-xs text-muted-foreground">요약</label>
                  <textarea
                    id={`cwr-summary-${report.id}`}
                    value={draftSummary}
                    onChange={(event) => setDraftSummary(event.target.value)}
                    rows={2}
                    className="rounded-lg border border-border bg-background p-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`cwr-sections-${report.id}`} className="text-xs text-muted-foreground">
                    사업영역별 본문 (JSON)
                  </label>
                  <textarea
                    id={`cwr-sections-${report.id}`}
                    value={draftSections}
                    onChange={(event) => setDraftSections(event.target.value)}
                    rows={12}
                    className="rounded-lg border border-border bg-background p-2 font-mono text-xs"
                  />
                  {sectionsError && <p className="text-xs text-negative">{sectionsError}</p>}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={isRowPending} onClick={() => void saveEdit(report)}>
                    {isRowPending && pendingAction === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    저장
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={isRowPending} onClick={cancelEdit}>
                    취소
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>

    <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>브리핑 삭제</DialogTitle>
          <DialogDescription>
            {deleteTarget && `${deleteTarget.week_start} ~ ${deleteTarget.week_end} 브리핑을 삭제하시겠습니까? 되돌릴 수 없습니다.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
            취소
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => void confirmDelete()}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
