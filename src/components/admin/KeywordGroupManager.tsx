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
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { TagType } from '@/lib/types'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { useAdminTable } from '@/lib/admin/use-admin-table'

// ─── 상수 ──────────────────────────────────────────────────────────────────

const TAG_TYPES: TagType[] = ['industry', 'company', 'tech', 'market', 'policy', 'content_type']

const TAG_TYPE_LABELS: Record<TagType, string> = {
  industry:     '산업',
  company:      '기업',
  tech:         '기술',
  market:       '시장',
  policy:       '정책',
  content_type: '콘텐츠 유형',
}

// signal_type enum 값 (SQL 65와 반드시 일치)
const NO_SIGNAL = 'none'
const PAGE_SIZE = 20

const SIGNAL_TYPES = [
  '경쟁사동향',
  '규제',
  '정부',
  '신제품',
  '출시',
  '투자',
  'M&A',
  '기술트렌드',
] as const

type SignalType = typeof SIGNAL_TYPES[number]

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  name: string
  kind: string
  tag_type: TagType
  description: string | null
  include_patterns: string[]
  exclude_patterns: string[]
  search_seeds: string[]
  weight: number
  signal_hint: string | null
  is_active: boolean
}

interface GroupForm {
  name: string
  kind: string
  tag_type: TagType
  description: string
  includePatterns: string[]
  excludePatterns: string[]
  searchSeeds: string[]
  weight: string
  signalHint: SignalType | ''
  is_active: boolean
}

const FORM_INIT: GroupForm = {
  name:            '',
  kind:            '',
  tag_type:        'industry',
  description:     '',
  includePatterns: [],
  excludePatterns: [],
  searchSeeds:     [],
  weight:          '1.0',
  signalHint:      '',
  is_active:       true,
}

// ─── 칩 입력 컴포넌트 ──────────────────────────────────────────────────────

interface ChipInputProps {
  id: string
  label: string
  hint?: string
  chips: string[]
  onChange: (chips: string[]) => void
}

function ChipInput({ id, label, hint, chips, onChange }: ChipInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addChip = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || chips.includes(trimmed)) return
    onChange([...chips, trimmed])
    setInputValue('')
  }

  const removeChip = (index: number) => {
    onChange(chips.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addChip(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      onChange(chips.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div
        className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-foreground"
          >
            {chip}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeChip(i) }}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`${chip} 제거`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addChip(inputValue)}
          placeholder={chips.length === 0 ? 'Enter 또는 , 로 추가' : ''}
          className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      {chips.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{chips.length}개</p>
      )}
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function KeywordGroupManager() {
  const supabase = createClient()
  const table = useAdminTable({ defaultSort: { key: 'kind', dir: 'asc' }, pageSize: PAGE_SIZE })

  const [groups,    setGroups]    = useState<GroupRow[]>([])
  const [total,     setTotal]     = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState<GroupForm>(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving,  setIsSaving]  = useState(false)

  // ── 목록 로드 ────────────────────────────────────────────────────────────

  async function loadGroups() {
    setIsLoading(true)
    setError(null)
    setFetchError(null)
    const { data, error: err, count } = await supabase
      .from('keyword_groups')
      .select('id, name, kind, tag_type, description, include_patterns, exclude_patterns, search_seeds, weight, signal_hint, is_active', { count: 'exact' })
      .order('kind')
      .order('name')
      .range((table.page - 1) * PAGE_SIZE, table.page * PAGE_SIZE - 1)
    if (err) {
      const message = `키워드 그룹 목록 로드 실패: ${err.message}`
      setError(message)
      setFetchError(message)
    } else {
      setGroups((data ?? []) as GroupRow[])
      setTotal(count ?? 0)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      const { data, error: err, count } = await supabase
        .from('keyword_groups')
        .select('id, name, kind, tag_type, description, include_patterns, exclude_patterns, search_seeds, weight, signal_hint, is_active', { count: 'exact' })
        .order('kind')
        .order('name')
        .range((table.page - 1) * PAGE_SIZE, table.page * PAGE_SIZE - 1)
      if (err) {
        const message = `키워드 그룹 목록 로드 실패: ${err.message}`
        setError(message)
        setFetchError(message)
      } else {
        setGroups((data ?? []) as GroupRow[])
        setTotal(count ?? 0)
      }
      setIsLoading(false)
    }
    void init()
  }, [table.page]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폼 열기/닫기 ────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(group: GroupRow) {
    setForm({
      name:            group.name,
      kind:            group.kind,
      tag_type:        group.tag_type,
      description:     group.description ?? '',
      includePatterns: group.include_patterns ?? [],
      excludePatterns: group.exclude_patterns ?? [],
      searchSeeds:     group.search_seeds ?? [],
      weight:          String(group.weight),
      signalHint:      (group.signal_hint ?? '') as SignalType | '',
      is_active:       group.is_active,
    })
    setEditingId(group.id)
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

    if (!form.name.trim()) { setFormError('이름을 입력해주세요.'); return }
    if (!form.kind.trim()) { setFormError('Kind(슬러그)를 입력해주세요.'); return }

    const parsedWeight = parseFloat(form.weight)
    const weight = isNaN(parsedWeight) ? 1.0 : parsedWeight

    setIsSaving(true)
    try {
      const payload = {
        name:             form.name.trim(),
        kind:             form.kind.trim(),
        tag_type:         form.tag_type,
        description:      form.description.trim() || null,
        include_patterns: form.includePatterns,
        exclude_patterns: form.excludePatterns,
        search_seeds:     form.searchSeeds,
        weight,
        signal_hint:      form.signalHint || null,
        is_active:        form.is_active,
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('keyword_groups')
          .update(payload)
          .eq('id', editingId)
        if (err) throw new Error(`수정 실패: ${err.message}`)
      } else {
        const { error: err } = await supabase
          .from('keyword_groups')
          .insert(payload)
        if (err) throw new Error(`추가 실패: ${err.message}`)
      }

      closeForm()
      await loadGroups()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── 활성 토글 (낙관적 갱신) ──────────────────────────────────────────────

  const handleToggle = async (group: GroupRow) => {
    const next = !group.is_active
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_active: next } : g))
    const { error: err } = await supabase
      .from('keyword_groups')
      .update({ is_active: next })
      .eq('id', group.id)
    if (err) {
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_active: group.is_active } : g))
      setError(`활성 상태 변경 실패: ${err.message}`)
    }
  }

  // ── 삭제 ─────────────────────────────────────────────────────────────────

  const handleDelete = async (group: GroupRow) => {
    const confirmed = window.confirm(
      `"${group.name}" 그룹을 삭제하시겠습니까?\n\n` +
      `⚠️ 삭제 시 이 그룹의 관련도·태그·검색 시드가 사라집니다.\n` +
      `중단만 원한다면 비활성화를 권장합니다.`
    )
    if (!confirmed) return

    const { error: err } = await supabase
      .from('keyword_groups')
      .delete()
      .eq('id', group.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setGroups(prev => prev.filter(g => g.id !== group.id))
    }
  }

  const columns: AdminTableColumn<GroupRow>[] = [
    { key: 'name', header: '이름 / Kind', cell: (group) => <><div className="font-medium text-foreground">{group.name}</div><div className="text-xs text-muted-foreground">{group.kind}</div></> },
    { key: 'tagType', header: '태그 유형', cell: (group) => <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{TAG_TYPE_LABELS[group.tag_type]}</span> },
    { key: 'weight', header: '가중치', align: 'center', cell: (group) => <span className="text-xs font-medium tabular-nums">{group.weight}</span> },
    { key: 'include', header: 'Include', align: 'center', cell: (group) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', group.include_patterns?.length > 0 ? 'bg-positive-soft text-positive' : 'text-muted-foreground')}>{group.include_patterns?.length ?? 0}개</span> },
    { key: 'exclude', header: 'Exclude', align: 'center', cell: (group) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', group.exclude_patterns?.length > 0 ? 'bg-negative-soft text-negative' : 'text-muted-foreground')}>{group.exclude_patterns?.length ?? 0}개</span> },
    { key: 'seeds', header: 'Seeds', align: 'center', cell: (group) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', group.search_seeds?.length > 0 ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground')}>{group.search_seeds?.length ?? 0}개</span> },
    { key: 'signal', header: '시그널', cell: (group) => group.signal_hint ? <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{group.signal_hint}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'active', header: '활성', cell: (group) => <button onClick={() => handleToggle(group)} className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', group.is_active ? 'bg-positive-soft text-positive hover:opacity-80' : 'bg-muted text-muted-foreground hover:bg-accent')}>{group.is_active ? '활성' : '비활성'}</button> },
    { key: 'actions', header: '작업', align: 'right', cell: (group) => <div className="flex items-center justify-end gap-0.5"><button onClick={() => openEdit(group)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="수정"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(group)} className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button></div> },
  ]

  const tableState: AdminTableState = isLoading ? 'loading' : fetchError ? 'error' : total === 0 ? 'empty' : 'idle'

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
              {editingId ? '키워드 그룹 수정' : '새 키워드 그룹 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              {formError && (
                <AdminErrorBox>
                  {formError}
                </AdminErrorBox>
              )}

              {/* 이름 · Kind */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kg-name">
                    이름 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="kg-name"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="예: AI기술"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kg-kind">
                    Kind (슬러그) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="kg-kind"
                    value={form.kind}
                    onChange={(e) => setForm(p => ({ ...p, kind: e.target.value }))}
                    placeholder="예: ai_tech"
                  />
                </div>
              </div>

              {/* tag_type · weight */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kg-tagtype">태그 유형</Label>
                  <Select
                    value={form.tag_type}
                    onValueChange={(v) => setForm(p => ({ ...p, tag_type: v as TagType }))}
                  >
                    <SelectTrigger id="kg-tagtype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAG_TYPES.map(t => (
                        <SelectItem key={t} value={t}>
                          {TAG_TYPE_LABELS[t]} ({t})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kg-weight">
                    가중치{' '}
                    <span className="text-xs font-normal text-muted-foreground">기본 1.0, 높을수록 관련도↑</span>
                  </Label>
                  <Input
                    id="kg-weight"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={form.weight}
                    onChange={(e) => setForm(p => ({ ...p, weight: e.target.value }))}
                    placeholder="1.0"
                  />
                </div>
              </div>

              {/* 설명 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kg-desc">
                  설명{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <Input
                  id="kg-desc"
                  value={form.description}
                  onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="이 그룹의 수집 목적이나 범위"
                />
              </div>

              {/* include_patterns */}
              <ChipInput
                id="kg-include"
                label="Include 패턴 (관련도↑ · 해시태그)"
                hint="포함되면 관련도 점수 가산·해시태그 부여. Enter 또는 , 로 추가."
                chips={form.includePatterns}
                onChange={(chips) => setForm(p => ({ ...p, includePatterns: chips }))}
              />

              {/* exclude_patterns */}
              <ChipInput
                id="kg-exclude"
                label="Exclude 패턴 (하드 제외)"
                hint="⚠️ 제목에 포함되면 도메인 무관하게 무조건 탈락. 과하게 넣으면 정상 기사도 제외됩니다."
                chips={form.excludePatterns}
                onChange={(chips) => setForm(p => ({ ...p, excludePatterns: chips }))}
              />

              {/* search_seeds */}
              <ChipInput
                id="kg-seeds"
                label="Search Seeds (Google News · 유튜브 검색어)"
                hint="뉴스(56)·유튜브(60) 키워드 검색에 사용. 변경은 다음 수집부터 반영."
                chips={form.searchSeeds}
                onChange={(chips) => setForm(p => ({ ...p, searchSeeds: chips }))}
              />

              {/* signal_hint */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kg-signal">
                  시그널 힌트{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택 — 이 그룹 매칭 시 content_signals 에 적재)</span>
                </Label>
                <Select
                  value={form.signalHint || NO_SIGNAL}
                  onValueChange={(v) => setForm(p => ({ ...p, signalHint: v === NO_SIGNAL ? '' : (v as SignalType) }))}
                >
                  <SelectTrigger id="kg-signal">
                    <SelectValue placeholder="없음 (시그널 미적재)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SIGNAL}>없음</SelectItem>
                    {SIGNAL_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 활성화 */}
              <div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                  />
                  <span className="text-sm text-foreground">활성화 (관련도·태그·검색에 사용)</span>
                </label>
              </div>

              {/* 버튼 */}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>취소</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중…</>
                    : editingId ? '수정 저장' : '그룹 추가'
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 목록 헤더 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${total}개 그룹`}
        </p>
        {!showForm && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            그룹 추가
          </Button>
        )}
      </div>

      {/* ── 목록 테이블 ── */}
      <AdminTable
        columns={columns}
        rows={groups}
        rowKey={(group) => group.id}
        minWidth="min-w-[860px]"
        state={tableState}
        emptyMessage="등록된 키워드 그룹이 없습니다."
        errorMessage={fetchError ?? undefined}
        onRetry={loadGroups}
        pagination={{ page: table.page, pageSize: PAGE_SIZE, total }}
        onPageChange={table.setPage}
      />
    </div>
  )
}
