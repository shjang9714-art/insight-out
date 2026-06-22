'use client'

import { useState, useEffect, useRef } from 'react'
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
import { cn } from '@/lib/utils'
import { BrainCircuit, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { IssueStatus } from '@/lib/types'

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface IssueRow {
  id: string
  title: string
  summary: string | null
  status: IssueStatus
  match_keywords: string[]
  created_at: string
  content_count?: number
}

interface IssueForm {
  title: string
  summary: string
  status: IssueStatus
  match_keywords: string[]
}

const FORM_INIT: IssueForm = {
  title: '',
  summary: '',
  status: 'draft',
  match_keywords: [],
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  draft:     '초안',
  published: '발행',
  archived:  '보관',
}

const STATUS_STYLE: Record<IssueStatus, string> = {
  draft:     'bg-muted text-muted-foreground',
  published: 'bg-emerald-50 text-emerald-700',
  archived:  'bg-amber-50 text-amber-700',
}

// ─── 키워드 칩 입력 ────────────────────────────────────────────────────────

interface ChipInputProps {
  chips: string[]
  onChange: (chips: string[]) => void
  placeholder?: string
}

function ChipInput({ chips, onChange, placeholder }: ChipInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || chips.includes(trimmed)) { setInputValue(''); return }
    onChange([...chips, trimmed])
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      onChange(chips.slice(0, -1))
    }
  }

  return (
    <div
      className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-foreground"
        >
          {chip}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(chips.filter(c => c !== chip)) }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`${chip} 제거`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={chips.length === 0 ? (placeholder ?? 'Enter 또는 , 로 추가') : ''}
        className="min-w-[160px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function IssueManager() {
  const supabase = createClient()

  // 목록 상태
  const [issues,       setIssues]       = useState<IssueRow[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<IssueStatus | 'all'>('all')
  const [searchQuery,  setSearchQuery]  = useState('')

  // 폼 상태
  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState<IssueForm>(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving,  setIsSaving]  = useState(false)

  // 재배정 상태
  const [rematchingId,  setRematchingId]  = useState<string | null>(null)
  const [rematchMsg,    setRematchMsg]    = useState<{ id: string; text: string; ok: boolean } | null>(null)

  // AI 브리핑 생성 상태
  const [briefingId,  setBriefingId]  = useState<string | null>(null)
  const [briefMsg,    setBriefMsg]    = useState<{ id: string; text: string; ok: boolean } | null>(null)

  // ── 초기 로드 ─────────────────────────────────────────────────────────────

  async function loadIssues() {
    const { data, error: err } = await supabase
      .from('issues')
      .select('id, title, summary, status, match_keywords, created_at')
      .order('created_at', { ascending: false })

    if (err) {
      setError(`이슈 목록 로드 실패: ${err.message}`)
      return
    }

    const rows = (data ?? []) as IssueRow[]

    // 배정 콘텐츠 수 일괄 집계
    if (rows.length > 0) {
      const ids = rows.map(r => r.id)
      const { data: icData } = await supabase
        .from('issue_contents')
        .select('issue_id')
        .in('issue_id', ids)

      const countMap = new Map<string, number>()
      for (const row of (icData ?? []) as { issue_id: string }[]) {
        countMap.set(row.issue_id, (countMap.get(row.issue_id) ?? 0) + 1)
      }
      rows.forEach(r => { r.content_count = countMap.get(r.id) ?? 0 })
    }

    setIssues(rows)
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await loadIssues()
      setIsLoading(false)
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 파생 목록 ─────────────────────────────────────────────────────────────

  const visibleIssues = issues.filter(issue => {
    if (filterStatus !== 'all' && issue.status !== filterStatus) return false
    if (searchQuery.trim()) {
      return issue.title.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  const statusCounts = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  // ── 폼 열기/닫기 ─────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(issue: IssueRow) {
    setForm({
      title:          issue.title,
      summary:        issue.summary ?? '',
      status:         issue.status,
      match_keywords: issue.match_keywords ?? [],
    })
    setEditingId(issue.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  // ── 저장 ─────────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim()) { setFormError('제목을 입력해주세요.'); return }

    setIsSaving(true)
    try {
      const payload = {
        title:          form.title.trim(),
        summary:        form.summary.trim() || null,
        status:         form.status,
        match_keywords: form.match_keywords,
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('issues')
          .update(payload)
          .eq('id', editingId)
        if (err) throw new Error(`수정 실패: ${err.message}`)
      } else {
        const { error: err } = await supabase
          .from('issues')
          .insert(payload)
        if (err) throw new Error(`추가 실패: ${err.message}`)
      }

      closeForm()
      await loadIssues()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── 삭제 ─────────────────────────────────────────────────────────────────

  const handleDelete = async (issue: IssueRow) => {
    const confirmed = window.confirm(
      `"${issue.title}" 이슈를 삭제하시겠습니까?\n\n⚠️ 배정된 콘텐츠 연결도 함께 삭제됩니다.`
    )
    if (!confirmed) return
    const { error: err } = await supabase
      .from('issues')
      .delete()
      .eq('id', issue.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setIssues(prev => prev.filter(i => i.id !== issue.id))
    }
  }

  // ── 키워드로 재배정 ───────────────────────────────────────────────────────

  const handleRematch = async (issue: IssueRow) => {
    if (issue.match_keywords.length === 0) {
      setRematchMsg({ id: issue.id, text: 'match_keywords 가 없습니다. 수정에서 키워드를 등록하세요.', ok: false })
      return
    }

    setRematchingId(issue.id)
    setRematchMsg(null)

    try {
      const perKeyword = await Promise.all(
        issue.match_keywords.map(kw =>
          supabase
            .from('contents')
            .select('id')
            .eq('status', 'published')
            .or(`title.ilike.%${kw}%,summary_ko.ilike.%${kw}%`)
            .limit(300)
        )
      )

      const idSet = new Set<string>()
      for (const res of perKeyword) {
        for (const row of (res.data ?? []) as { id: string }[]) {
          idSet.add(row.id)
        }
      }

      if (idSet.size === 0) {
        setRematchMsg({ id: issue.id, text: '키워드에 매칭되는 콘텐츠가 없습니다.', ok: false })
        return
      }

      const rows = [...idSet].slice(0, 300).map(contentId => ({
        issue_id:   issue.id,
        content_id: contentId,
        source:     'rule' as const,
      }))

      const { error: err } = await supabase
        .from('issue_contents')
        .upsert(rows, { onConflict: 'issue_id,content_id', ignoreDuplicates: true })

      if (err) throw new Error(`재배정 실패: ${err.message}`)

      setRematchMsg({ id: issue.id, text: `${rows.length}건 배정 완료`, ok: true })
      await loadIssues()
    } catch (err) {
      setRematchMsg({
        id:   issue.id,
        text: err instanceof Error ? err.message : '재배정 중 오류가 발생했습니다.',
        ok:   false,
      })
    } finally {
      setRematchingId(null)
    }
  }

  // ── AI 브리핑 생성 ───────────────────────────────────────────────────────

  const handleBrief = async (issue: IssueRow) => {
    setBriefingId(issue.id)
    setBriefMsg(null)

    try {
      const res = await fetch(`/api/admin/issues/${issue.id}/brief`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setBriefMsg({ id: issue.id, text: body.error ?? `오류 (${res.status})`, ok: false })
        return
      }
      setBriefMsg({ id: issue.id, text: 'AI 브리핑 생성 완료', ok: true })
    } catch (err) {
      setBriefMsg({
        id:   issue.id,
        text: err instanceof Error ? err.message : '브리핑 생성 중 오류가 발생했습니다.',
        ok:   false,
      })
    } finally {
      setBriefingId(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* 전역 오류 */}
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 shrink-0 text-red-400 underline hover:text-red-600">닫기</button>
        </div>
      )}

      {/* ── 생성/수정 폼 ── */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {editingId ? '이슈 수정' : '새 이슈 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { void handleSave(e) }} className="space-y-5">
              {formError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="issue-title">
                    제목 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="issue-title"
                    value={form.title}
                    onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="이슈 제목"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="issue-status">상태</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm(p => ({ ...p, status: v as IssueStatus }))}
                  >
                    <SelectTrigger id="issue-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['draft', 'published', 'archived'] as IssueStatus[]).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-summary">
                  요약 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <textarea
                  id="issue-summary"
                  value={form.summary}
                  onChange={(e) => setForm(p => ({ ...p, summary: e.target.value }))}
                  placeholder="이슈에 대한 한두 문장 요약"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>
                  match_keywords{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    — 자동·재배정 기준 키워드 (Enter 또는 , 로 추가)
                  </span>
                </Label>
                <ChipInput
                  chips={form.match_keywords}
                  onChange={(chips) => setForm(p => ({ ...p, match_keywords: chips }))}
                  placeholder="키워드 입력…"
                />
                <p className="text-[11px] text-muted-foreground">
                  짧은 단어는 오탐이 많으니 구체적인 키워드를 사용하세요. 저장 후 목록에서 &lsquo;재배정&rsquo; 버튼으로 기존 콘텐츠에 반영하세요.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>취소</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중…</>
                    : editingId ? '수정 저장' : '이슈 추가'
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 상태 필터 + 검색 + 추가 버튼 ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'draft', 'published', 'archived'] as const).map(s => {
            const count = s === 'all' ? issues.length : (statusCounts[s] ?? 0)
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filterStatus === s
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                )}
              >
                {s === 'all' ? '전체' : STATUS_LABEL[s]}
                <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이슈 제목 검색…"
              className="pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="검색어 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!showForm && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              이슈 추가
            </Button>
          )}
        </div>
      </div>

      {/* ── 목록 카운트 ── */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? '불러오는 중…' : `${visibleIssues.length}개 표시 (전체 ${issues.length}개)`}
      </p>

      {/* ── 목록 테이블 ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />불러오는 중…
        </div>
      ) : visibleIssues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {searchQuery ? '검색 결과가 없습니다.' : '등록된 이슈가 없습니다.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-center">배정</th>
                <th className="px-4 py-3 text-center">키워드</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleIssues.map(issue => (
                <tr key={issue.id} className="transition-colors hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{issue.title}</div>
                    {issue.summary && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{issue.summary}</div>
                    )}
                    {rematchMsg?.id === issue.id && (
                      <div className={cn(
                        'mt-1 text-[11px] font-medium',
                        rematchMsg.ok ? 'text-emerald-600' : 'text-red-500'
                      )}>
                        {rematchMsg.text}
                      </div>
                    )}
                    {briefMsg?.id === issue.id && (
                      <div className={cn(
                        'mt-1 text-[11px] font-medium',
                        briefMsg.ok ? 'text-blue-600' : 'text-red-500'
                      )}>
                        {briefMsg.text}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      STATUS_STYLE[issue.status]
                    )}>
                      {STATUS_LABEL[issue.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-medium tabular-nums">
                    {issue.content_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-xs tabular-nums text-muted-foreground">
                    {issue.match_keywords?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => openEdit(issue)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { void handleRematch(issue) }}
                        disabled={rematchingId === issue.id}
                        className={cn(
                          'rounded p-1.5 transition-colors hover:bg-accent hover:text-foreground',
                          rematchingId === issue.id
                            ? 'cursor-wait text-muted-foreground/40'
                            : issue.match_keywords?.length > 0
                              ? 'text-brand-600 hover:bg-brand-50'
                              : 'text-muted-foreground/30 cursor-default'
                        )}
                        title={issue.match_keywords?.length > 0 ? '키워드로 재배정' : 'match_keywords 없음'}
                      >
                        {rematchingId === issue.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                      </button>
                      <button
                        onClick={() => { void handleBrief(issue) }}
                        disabled={briefingId === issue.id}
                        className={cn(
                          'rounded p-1.5 transition-colors hover:bg-accent hover:text-foreground',
                          briefingId === issue.id
                            ? 'cursor-wait text-muted-foreground/40'
                            : 'text-blue-500 hover:bg-blue-50 hover:text-blue-700'
                        )}
                        title="AI 브리핑 생성"
                      >
                        {briefingId === issue.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <BrainCircuit className="h-3.5 w-3.5" />
                        }
                      </button>
                      <button
                        onClick={() => { void handleDelete(issue) }}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
