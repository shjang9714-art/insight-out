'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import EntityAutocomplete, { type EntityOption } from '@/components/admin/EntityAutocomplete'
import { COMPANY_DOC_SOURCE_KINDS, SOURCE_KIND_LABELS } from '@/lib/company-docs/constants'
import type { CompanyDocumentSourceKind } from '@/lib/types'

interface SourceRow {
  id: string
  entity_id: string
  name: string
  url: string
  source_kind: CompanyDocumentSourceKind
  collect_method: string
  target_file_types: string[]
  interval_minutes: number | null
  last_crawled_at: string | null
  last_success_at: string | null
  is_active: boolean
  error_state: string | null
  auto_publish: boolean
  entities: { canonical_name: string } | { canonical_name: string }[] | null
}

interface SourceForm {
  entity: EntityOption | null
  name: string
  url: string
  sourceKind: CompanyDocumentSourceKind
  collectMethod: string
  targetFileTypes: string
  intervalMinutes: string
  autoPublish: boolean
}

const FORM_INIT: SourceForm = {
  entity: null,
  name: '',
  url: '',
  sourceKind: 'HTML_LIST',
  collectMethod: '',
  targetFileTypes: 'pdf',
  intervalMinutes: '1440',
  autoPublish: false,
}

function firstRelation(value: SourceRow['entities']): { canonical_name: string } | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function CompanyDocumentSourceRegistry() {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [tableState, setTableState] = useState<AdminTableState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [schemaMissing, setSchemaMissing] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SourceForm>(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [collectMessage, setCollectMessage] = useState<string | null>(null)

  async function loadSources() {
    setTableState('loading')
    try {
      const res = await fetch('/api/admin/company-documents/sources')
      const data = await res.json() as { sources?: SourceRow[]; schemaMissing?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? '소스 목록을 불러오지 못했습니다.')
      const nextSources = data.sources ?? []
      setSources(nextSources)
      setSchemaMissing(data.schemaMissing === true)
      setError(null)
      setTableState(nextSources[0] ? 'idle' : 'empty')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '소스 목록을 불러오지 못했습니다.')
      setTableState('error')
    }
  }

  useEffect(() => {
    const init = async () => { await loadSources() }
    void init()
  }, [])

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(src: SourceRow) {
    setForm({
      entity: { id: src.entity_id, canonical_name: firstRelation(src.entities)?.canonical_name ?? '' },
      name: src.name,
      url: src.url,
      sourceKind: src.source_kind,
      collectMethod: src.collect_method,
      targetFileTypes: src.target_file_types.join(', '),
      intervalMinutes: src.interval_minutes ? String(src.interval_minutes) : '',
      autoPublish: src.auto_publish,
    })
    setEditingId(src.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!editingId && !form.entity) {
      setFormError('기업을 선택해주세요.')
      return
    }
    if (!form.name.trim() || !form.url.trim() || !form.collectMethod.trim()) {
      setFormError('이름·URL·수집 방법은 필수입니다.')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        entityId: form.entity?.id,
        name: form.name.trim(),
        url: form.url.trim(),
        sourceKind: form.sourceKind,
        collectMethod: form.collectMethod.trim(),
        targetFileTypes: form.targetFileTypes.split(',').map((v) => v.trim()).filter(Boolean),
        intervalMinutes: form.intervalMinutes ? parseInt(form.intervalMinutes, 10) : null,
        autoPublish: form.autoPublish,
      }

      const res = await fetch(
        editingId ? `/api/admin/company-documents/sources/${editingId}` : '/api/admin/company-documents/sources',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const data = await res.json() as { source?: SourceRow; error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.')

      closeForm()
      await loadSources()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(src: SourceRow) {
    const next = !src.is_active
    setSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, is_active: next } : s)))
    const res = await fetch(`/api/admin/company-documents/sources/${src.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    })
    if (!res.ok) {
      setSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, is_active: src.is_active } : s)))
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? '활성 상태 변경에 실패했습니다.')
    }
  }

  async function handleDelete(src: SourceRow) {
    const confirmed = window.confirm(`"${src.name}" 소스를 삭제하시겠습니까?\n\n이미 적재된 문서는 보존됩니다.`)
    if (!confirmed) return
    const res = await fetch(`/api/admin/company-documents/sources/${src.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? '삭제에 실패했습니다.')
      return
    }
    setSources((prev) => {
      const nextSources = prev.filter((source) => source.id !== src.id)
      setTableState(nextSources[0] ? 'idle' : 'empty')
      return nextSources
    })
  }

  async function handleCollect(src: SourceRow) {
    setCollectingId(src.id)
    setCollectMessage(null)
    try {
      const res = await fetch(`/api/admin/company-documents/sources/${src.id}/collect`, { method: 'POST' })
      const data = await res.json() as { message?: string; error?: string; newCount?: number; skipped?: boolean }
      if (!res.ok) throw new Error(data.error ?? '수집에 실패했습니다.')
      setCollectMessage(
        data.skipped
          ? (data.message ?? '수집을 건너뛰었습니다.')
          : `수집 완료 — 신규 ${data.newCount ?? 0}건`,
      )
      await loadSources()
    } catch (caught) {
      setCollectMessage(caught instanceof Error ? caught.message : '수집 중 오류가 발생했습니다.')
    } finally {
      setCollectingId(null)
    }
  }

  const columns: AdminTableColumn<SourceRow>[] = [
    { key: 'entity', header: '기업', nowrap: true, cell: (src) => <span className="font-medium text-foreground">{firstRelation(src.entities)?.canonical_name ?? '미매칭'}</span> },
    { key: 'source', header: '소스', width: 'max-w-xs', truncate: true, cell: (src) => <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 hover:underline" title={src.url}>{src.name}</a> },
    { key: 'kind', header: '종류', nowrap: true, cell: (src) => <span className="text-muted-foreground">{SOURCE_KIND_LABELS[src.source_kind]}</span> },
    { key: 'interval', header: '주기(분)', nowrap: true, cell: (src) => <span className="text-muted-foreground">{src.interval_minutes ?? '—'}</span> },
    { key: 'last_crawled_at', header: '마지막 수집', nowrap: true, cell: (src) => <span className="text-xs text-muted-foreground">{formatKst(src.last_crawled_at)}</span> },
    {
      key: 'status',
      header: '상태',
      nowrap: true,
      cell: (src) => (
        <>
          <button onClick={() => void handleToggleActive(src)} className={src.is_active ? 'text-xs font-medium text-positive hover:opacity-80' : 'text-xs font-medium text-muted-foreground hover:text-foreground'}>
            {src.is_active ? '활성' : '비활성'}
          </button>
          {src.error_state && <span className="ml-2 text-[11px] text-negative" title={src.error_state}>오류</span>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '작업',
      align: 'right',
      cell: (src) => (
        <div className="flex items-center justify-end gap-0.5">
          <button onClick={() => void handleCollect(src)} disabled={collectingId === src.id} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50" title="즉시 수집">
            {collectingId === src.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => openEdit(src)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="수정">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => void handleDelete(src)} className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive" title="삭제">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ]

  if (schemaMissing) return null

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">소스 레지스트리 (355-C)</h2>
          <p className="mt-1 text-xs text-muted-foreground">기업별 자료 소스를 등록·관리합니다. API(DART) 소스만 즉시 수집을 지원합니다.</p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            소스 추가
          </Button>
        )}
      </div>

      {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}
      {collectMessage && (
        <p className="text-xs text-muted-foreground" aria-live="polite">{collectMessage}</p>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">{editingId ? '소스 수정' : '새 소스 추가'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && <AdminErrorBox>{formError}</AdminErrorBox>}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-entity">기업 {!editingId && <span className="text-destructive">*</span>}</Label>
                  {editingId ? (
                    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {form.entity?.canonical_name ?? '—'}（기업 변경 불가, 새 소스로 등록하세요）
                    </p>
                  ) : (
                    <EntityAutocomplete
                      id="doc-src-entity"
                      value={form.entity}
                      onChange={(entity) => setForm((p) => ({ ...p, entity }))}
                      placeholder="기업명을 입력하세요"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-name">이름 <span className="text-destructive">*</span></Label>
                  <Input id="doc-src-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="예: IR 자료실" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doc-src-url">URL <span className="text-destructive">*</span></Label>
                <Input id="doc-src-url" type="url" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://..." />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-kind">소스 종류</Label>
                  <Select value={form.sourceKind} onValueChange={(v) => setForm((p) => ({ ...p, sourceKind: v as CompanyDocumentSourceKind }))}>
                    <SelectTrigger id="doc-src-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPANY_DOC_SOURCE_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-method">수집 방법 <span className="text-destructive">*</span></Label>
                  <Input id="doc-src-method" value={form.collectMethod} onChange={(e) => setForm((p) => ({ ...p, collectMethod: e.target.value }))} placeholder="예: 매일 09시 목록 스캔" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-filetypes">허용 파일 유형(쉼표 구분)</Label>
                  <Input id="doc-src-filetypes" value={form.targetFileTypes} onChange={(e) => setForm((p) => ({ ...p, targetFileTypes: e.target.value }))} placeholder="pdf, pptx" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-src-interval">수집 주기(분)</Label>
                  <Input id="doc-src-interval" type="number" min={30} value={form.intervalMinutes} onChange={(e) => setForm((p) => ({ ...p, intervalMinutes: e.target.value }))} placeholder="1440" />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.autoPublish} onChange={(e) => setForm((p) => ({ ...p, autoPublish: e.target.checked }))} className="h-4 w-4 rounded border-border accent-[--color-brand-600]" />
                <span className="text-sm text-foreground">자동 공개(검토 없이 즉시 공개) — 신뢰 소스만 체크</span>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>취소</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingId ? '수정 저장' : '소스 추가'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <AdminTable
        columns={columns}
        rows={sources}
        rowKey={(src) => src.id}
        minWidth="min-w-[880px]"
        state={tableState}
        emptyMessage="등록된 소스가 없습니다."
        errorMessage="소스 목록을 불러오지 못했습니다."
      />
    </section>
  )
}
