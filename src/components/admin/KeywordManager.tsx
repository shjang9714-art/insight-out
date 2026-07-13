'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import StatusBadge from '@/components/admin/ui/StatusBadge'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ServiceOption {
  id: string
  name: string
}

interface KeywordRow {
  id: string
  name: string
  service_id: string | null
  is_competitor: boolean
  created_at: string
  services: { name: string }[] | null
}

interface KeywordForm {
  name: string
  service_id: string   // '' → null (미지정)
  is_competitor: boolean
}

const FORM_INIT: KeywordForm = {
  name:          '',
  service_id:    '',
  is_competitor: false,
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KeywordManager() {
  const supabase = createClient()

  const [services,  setServices]  = useState<ServiceOption[]>([])
  const [keywords,  setKeywords]  = useState<KeywordRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState<KeywordForm>(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving,  setIsSaving]  = useState(false)

  // ── 초기 로드 ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const [{ data: svcData, error: svcErr }, { data: kwData, error: kwErr }] =
        await Promise.all([
          supabase.from('services').select('id, name').order('name', { ascending: true }),
          supabase
            .from('keywords')
            .select('id, name, service_id, is_competitor, created_at, services(name)')
            .order('service_id', { ascending: true, nullsFirst: false })
            .order('name',       { ascending: true }),
        ])

      if (svcErr) setError(`서비스 목록 로드 실패: ${svcErr.message}`)
      else        setServices((svcData ?? []) as ServiceOption[])

      if (kwErr)  setError(`키워드 목록 로드 실패: ${kwErr.message}`)
      else        setKeywords((kwData ?? []) as KeywordRow[])

      setIsLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 목록 갱신 ─────────────────────────────────────────────────────────────

  async function loadKeywords() {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('keywords')
      .select('id, name, service_id, is_competitor, created_at, services(name)')
      .order('service_id', { ascending: true, nullsFirst: false })
      .order('name',       { ascending: true })
    if (err) {
      setError(`키워드 목록 로드 실패: ${err.message}`)
    } else {
      setKeywords((data ?? []) as KeywordRow[])
    }
    setIsLoading(false)
  }

  // ── 서비스별 그룹핑 ───────────────────────────────────────────────────────

  const keywordsByService = (() => {
    const map = new Map<string, KeywordRow[]>()
    services.forEach(s => map.set(s.id, []))
    map.set('', [])
    keywords.forEach(k => {
      const key = k.service_id ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(k)
    })
    map.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, 'ko')))
    return map
  })()

  const serviceCounts = (() => {
    const counts: Record<string, number> = {}
    keywordsByService.forEach((list, key) => { counts[key] = list.length })
    return counts
  })()

  // ── 폼 열기/닫기 ──────────────────────────────────────────────────────────

  function openAdd(defaultServiceId = '') {
    setForm({ ...FORM_INIT, service_id: defaultServiceId })
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(kw: KeywordRow) {
    setForm({
      name:          kw.name,
      service_id:    kw.service_id ?? '',
      is_competitor: kw.is_competitor,
    })
    setEditingId(kw.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('키워드명을 입력해주세요.')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        name:          form.name.trim(),
        service_id:    form.service_id || null,
        is_competitor: form.is_competitor,
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('keywords')
          .update(payload)
          .eq('id', editingId)
        if (err) {
          if (err.code === '23505') throw new Error('이미 등록된 키워드입니다.')
          throw new Error(`수정 실패: ${err.message}`)
        }
      } else {
        const { error: err } = await supabase
          .from('keywords')
          .insert(payload)
        if (err) {
          if (err.code === '23505') throw new Error('이미 등록된 키워드입니다.')
          throw new Error(`추가 실패: ${err.message}`)
        }
      }

      closeForm()
      await loadKeywords()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── 삭제 ──────────────────────────────────────────────────────────────────

  const handleDelete = async (kw: KeywordRow) => {
    const confirmed = window.confirm(
      `"${kw.name}"을(를) 삭제하시겠습니까?\n\n` +
      `⚠️ 이 키워드로 태깅된 콘텐츠 연결(content_keywords)도 함께 삭제됩니다.`
    )
    if (!confirmed) return

    const { error: err } = await supabase
      .from('keywords')
      .delete()
      .eq('id', kw.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setKeywords(prev => prev.filter(k => k.id !== kw.id))
    }
  }

  const keywordColumns: AdminTableColumn<KeywordRow>[] = [
    {
      key: 'name',
      header: '키워드',
      cell: keyword => <span className="font-medium text-foreground">{keyword.name}</span>,
    },
    {
      key: 'type',
      header: '구분',
      nowrap: true,
      cell: keyword => keyword.is_competitor && (
        <StatusBadge tone="risk" label="경쟁사" />
      ),
    },
    {
      key: 'actions',
      header: '관리',
      align: 'right',
      nowrap: true,
      cell: keyword => (
        <div className="flex items-center justify-end gap-0.5">
          <button
            onClick={() => openEdit(keyword)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="수정"
            aria-label={`${keyword.name} 수정`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(keyword)}
            className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="삭제"
            aria-label={`${keyword.name} 삭제`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ]

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <AdminErrorBox onDismiss={() => setError(null)}>
          <span>{error}</span>
        </AdminErrorBox>
      )}

      {/* ── 서비스별 키워드 수 요약 ── */}
      {!isLoading && services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {services.map(s => {
            const count = serviceCounts[s.id] ?? 0
            return (
              count === 0 ? (
                <StatusBadge
                  key={s.id}
                  tone="negative"
                  label={`${s.name} ${count}개`}
                  className="border border-negative/30 px-3 py-1"
                />
              ) : (
                <span
                  key={s.id}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {s.name} {count}개
                </span>
              )
            )
          })}
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            미지정 {serviceCounts[''] ?? 0}개
          </span>
        </div>
      )}

      {/* ── 추가/수정 폼 ── */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {editingId ? '키워드 수정' : '새 키워드 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <AdminErrorBox>
                  {formError}
                </AdminErrorBox>
              )}

              {/* 키워드명·서비스 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-name">
                    키워드명 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="kw-name"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="예: AI 컨택센터"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-service">
                    서비스{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Select
                    value={form.service_id || '__none__'}
                    onValueChange={(v) =>
                      setForm(p => ({ ...p, service_id: v === '__none__' ? '' : v }))
                    }
                  >
                    <SelectTrigger id="kw-service">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— 미지정</SelectItem>
                      {services.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 경쟁사 여부 */}
              <div className="flex items-center">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_competitor}
                    onChange={(e) => setForm(p => ({ ...p, is_competitor: e.target.checked }))}
                    className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                  />
                  <span className="text-sm text-foreground">경쟁사 키워드</span>
                  <span className="text-xs text-muted-foreground">(경쟁사 분석 태깅에 사용)</span>
                </label>
              </div>

              {/* 버튼 */}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>
                  취소
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    editingId ? '수정 저장' : '키워드 추가'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 목록 헤더 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${keywords.length}개 키워드`}
        </p>
        {!showForm && (
          <Button size="sm" onClick={() => openAdd()}>
            <Plus className="mr-1.5 h-4 w-4" />
            키워드 추가
          </Button>
        )}
      </div>

      {/* ── 서비스 대분류별 그룹 섹션 ── */}
      {isLoading ? (
        <AdminTable
          columns={keywordColumns}
          rows={[]}
          rowKey={keyword => keyword.id}
          loading
        />
      ) : keywords.length === 0 && services.length === 0 ? (
        <AdminTable
          columns={keywordColumns}
          rows={[]}
          rowKey={keyword => keyword.id}
          empty={{
            message: '등록된 키워드가 없습니다.',
            hint: '키워드 추가 버튼으로 첫 번째 키워드를 등록해보세요.',
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* 서비스 대분류 섹션 */}
          {services.map(s => {
            const svcKeywords = keywordsByService.get(s.id) ?? []
            return (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{s.name}</h3>
                    {svcKeywords.length === 0 ? (
                      <StatusBadge
                        tone="negative"
                        label="키워드 없음 — 추가 필요"
                        className="border border-negative/30"
                      />
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {svcKeywords.length}개
                      </span>
                    )}
                  </div>
                  {!showForm && (
                    <button
                      onClick={() => openAdd(s.id)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      추가
                    </button>
                  )}
                </div>

                {svcKeywords.length > 0 && (
                  <AdminTable
                    columns={keywordColumns}
                    rows={svcKeywords}
                    rowKey={keyword => keyword.id}
                    minWidth="min-w-[400px]"
                  />
                )}
              </div>
            )
          })}

          {/* 미지정 그룹 (맨 아래) */}
          {(keywordsByService.get('') ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <h3 className="text-sm font-semibold text-muted-foreground">미지정</h3>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {(keywordsByService.get('') ?? []).length}개
                </span>
              </div>
              <AdminTable
                columns={keywordColumns}
                rows={keywordsByService.get('') ?? []}
                rowKey={keyword => keyword.id}
                minWidth="min-w-[400px]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
