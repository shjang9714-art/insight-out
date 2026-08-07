'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import StatusBadge from '@/components/admin/ui/StatusBadge'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface KeywordRow {
  id: string
  name: string
  is_competitor: boolean
  created_at: string
}

interface KeywordForm {
  name: string
  is_competitor: boolean
}

const FORM_INIT: KeywordForm = {
  name:          '',
  is_competitor: false,
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KeywordManager() {
  const confirm = useAdminConfirm()
  const supabase = createClient()

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
      const { data: kwData, error: kwErr } = await supabase
        .from('keywords')
        .select('id, name, is_competitor, created_at')
        .order('name', { ascending: true })

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
      .select('id, name, is_competitor, created_at')
      .order('name', { ascending: true })
    if (err) {
      setError(`키워드 목록 로드 실패: ${err.message}`)
    } else {
      setKeywords((data ?? []) as KeywordRow[])
    }
    setIsLoading(false)
  }

  // ── 폼 열기/닫기 ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(kw: KeywordRow) {
    setForm({
      name:          kw.name,
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
    const confirmed = await confirm({ title: '키워드 삭제', description: '이 키워드로 태깅된 콘텐츠 연결도 함께 삭제됩니다.', targets: [kw.name], confirmLabel: '삭제', destructive: true })
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

      {isLoading ? (
        <AdminTable
          columns={keywordColumns}
          rows={[]}
          rowKey={keyword => keyword.id}
          state="loading"
        />
      ) : keywords.length === 0 ? (
        <AdminTable
          columns={keywordColumns}
          rows={[]}
          rowKey={keyword => keyword.id}
          state="empty"
          emptyMessage="등록된 키워드가 없습니다."
          emptyHint="키워드 추가 버튼으로 첫 번째 키워드를 등록해보세요."
        />
      ) : (
        <AdminTable
          columns={keywordColumns}
          rows={keywords}
          rowKey={keyword => keyword.id}
          minWidth="min-w-[400px]"
          state="idle"
        />
      )}
    </div>
  )
}
