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
import { GitMerge, Loader2, Pencil, Plus, Sparkles, Tag, Trash2, X } from 'lucide-react'
import { type EntityType, ENTITY_TYPE_LABEL } from '@/lib/types'
import type { NormalizationGroup } from '@/lib/entities/suggest-normalization'
import type { MergeJob } from '@/lib/admin/merge-progress'
import { Progress } from '@/components/ui/progress'
import { ENTITY_TYPE_CLS } from '@/lib/admin/palette'
import AdminTabs from '@/components/admin/ui/AdminTabs'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import AdminSelectionBar from '@/components/admin/ui/AdminSelectionBar'
import { useAdminTable } from '@/lib/admin/use-admin-table'

// ─── 상수 ──────────────────────────────────────────────────────────────────

const ENTITY_TYPES: EntityType[] = ['company', 'tech', 'product', 'person', 'policy', 'industry']
/** 경쟁사(동향, 224) 그룹 — 자유 텍스트 허용, 이 3개는 추천값(datalist)만 */
const COMPETITOR_GROUP_SUGGESTIONS = ['통신', '클라우드·플랫폼', '빅테크']

const ENTITY_SELECT_WITH_GROUP =
  'id, canonical_name, entity_type, description, is_competitor, mention_count, competitor_group'
const ENTITY_SELECT_NO_GROUP =
  'id, canonical_name, entity_type, description, is_competitor, mention_count'

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: EntityType
  description: string | null
  is_competitor: boolean
  mention_count: number
  /** 224 SQL 미적용 시 셀렉트에서 제외되어 undefined일 수 있음 */
  competitor_group?: string | null
}

interface AliasRow {
  id: string
  alias: string
  entity_id: string
}

interface EntityForm {
  canonical_name: string
  entity_type: EntityType
  description: string
  is_competitor: boolean
  competitor_group: string
}

const FORM_INIT: EntityForm = {
  canonical_name:   '',
  entity_type:      'company',
  description:      '',
  is_competitor:    false,
  competitor_group: '',
}

// ─── 동의어 칩 입력 ─────────────────────────────────────────────────────────

interface AliasChipInputProps {
  chips: string[]
  onAdd: (value: string) => void
  onRemove: (alias: string) => void
  placeholder?: string
}

function AliasChipInput({ chips, onAdd, onRemove, placeholder }: AliasChipInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || chips.includes(trimmed)) { setInputValue(''); return }
    onAdd(trimmed)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      onRemove(chips[chips.length - 1])
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
            onClick={(e) => { e.stopPropagation(); onRemove(chip) }}
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
        className="min-w-[140px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function EntityManager() {
  const confirm = useAdminConfirm()
  const supabase = createClient()
  const table = useAdminTable({ defaultSort: { key: 'canonical_name', dir: 'asc' }, pageSize: 50 })

  // 목록 상태
  const [entities,      setEntities]      = useState<EntityRow[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [filterType,    setFilterType]    = useState<EntityType | 'all'>('all')
  // 224 SQL(entities.competitor_group) 미적용 시 false — graceful degrade(필드 숨김·저장 시 제외)
  const [groupSupported, setGroupSupported] = useState(true)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<EntityRow[] | null>(null)
  const [isSearching,   setIsSearching]   = useState(false)

  // 폼 상태
  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState<EntityForm>(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving,  setIsSaving]  = useState(false)
  const [isBulkWorking, setIsBulkWorking] = useState(false)

  // 동의어 패널 상태
  const [aliasEntityId,    setAliasEntityId]    = useState<string | null>(null)
  const [aliases,          setAliases]          = useState<AliasRow[]>([])
  const [isLoadingAliases, setIsLoadingAliases] = useState(false)
  const [aliasError,       setAliasError]       = useState<string | null>(null)

  // 병합 패널 상태
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [mergeSearch,   setMergeSearch]   = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [isMerging,     setIsMerging]     = useState(false)
  const [mergeError,    setMergeError]    = useState<string | null>(null)

  // 정규화 제안 패널 상태
  const [showNormPanel,      setShowNormPanel]      = useState(false)
  const [normType,           setNormType]           = useState<EntityType | 'all'>('company')
  const [isLoadingNorm,      setIsLoadingNorm]      = useState(false)
  const [normGroups,         setNormGroups]         = useState<NormalizationGroup[]>([])
  const [normError,          setNormError]          = useState<string | null>(null)
  const [dismissedNormIds,   setDismissedNormIds]   = useState<Set<string>>(new Set())
  const [applyNormError,     setApplyNormError]     = useState<string | null>(null)
  // 백그라운드 병합 작업 상태
  const [normJobId,          setNormJobId]          = useState<string | null>(null)
  const [normJob,            setNormJob]            = useState<MergeJob | null>(null)
  const normPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 초기 로드 ─────────────────────────────────────────────────────────────

  /** competitor_group 포함 셀렉트 우선 시도, 컬럼 미존재(42703, 224 SQL 미적용)면 제외하고 재시도(graceful). */
  async function fetchEntitiesGraceful() {
    const withGroup = await supabase
      .from('entities')
      .select(ENTITY_SELECT_WITH_GROUP)
      .order('mention_count', { ascending: false })
    if (!withGroup.error) return { data: withGroup.data, error: null, groupSupported: true }
    if (withGroup.error.code !== '42703') return { data: null, error: withGroup.error, groupSupported: true }

    const fallback = await supabase
      .from('entities')
      .select(ENTITY_SELECT_NO_GROUP)
      .order('mention_count', { ascending: false })
    return { data: fallback.data, error: fallback.error, groupSupported: false }
  }

  async function loadEntities() {
    const { data, error: err, groupSupported } = await fetchEntitiesGraceful()
    setGroupSupported(groupSupported)
    if (err) {
      setError(`엔티티 목록 로드 실패: ${err.message}`)
    } else {
      setEntities((data ?? []) as EntityRow[])
    }
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      const entRes = await fetchEntitiesGraceful()
      setGroupSupported(entRes.groupSupported)
      if (entRes.error) {
        setError(`엔티티 목록 로드 실패: ${entRes.error.message}`)
      } else {
        setEntities((entRes.data ?? []) as EntityRow[])
      }
      setIsLoading(false)
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 검색 (canonical_name + 동의어) ───────────────────────────────────────

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) return
    const timer = setTimeout(async () => {
      setIsSearching(true)
      const lower = q.toLowerCase()
      const byName = entities.filter(e => e.canonical_name.toLowerCase().includes(lower))
      const idSet = new Set(byName.map(e => e.id))

      const { data: aliasRows } = await supabase
        .from('entity_aliases')
        .select('entity_id')
        .ilike('alias', `%${q}%`)

      const extraIds = (aliasRows ?? [])
        .map((r: { entity_id: string }) => r.entity_id)
        .filter((id: string) => !idSet.has(id))

      const extras = entities.filter(e => extraIds.includes(e.id))
      setSearchResults([...byName, ...extras])
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, entities]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 파생 목록 ─────────────────────────────────────────────────────────────

  // searchResults 는 검색어가 있을 때만 적용 — 없으면 전체 엔티티 사용
  const baseList = searchQuery.trim() ? (searchResults ?? entities) : entities
  const visibleEntities = filterType === 'all'
    ? baseList
    : baseList.filter(e => e.entity_type === filterType)

  const handleBulkCompetitor = async (next: boolean) => {
    const selected = visibleEntities.filter((entity) => table.selected.has(entity.id))
    if (selected.length === 0) return
    const confirmed = await confirm({ title: next ? '엔티티 일괄 경쟁사 지정' : '엔티티 일괄 경쟁사 해제', description: '선택한 엔티티의 경쟁사 상태를 변경합니다.', targets: selected.map((entity) => entity.canonical_name), confirmLabel: '변경' })
    if (!confirmed) return
    setIsBulkWorking(true)
    try {
      const { error: updateError } = await supabase.from('entities').update({ is_competitor: next }).in('id', selected.map((entity) => entity.id))
      if (updateError) throw updateError
      table.resetSelection()
      await loadEntities()
    } catch (err) { setError(err instanceof Error ? err.message : '일괄 상태 변경에 실패했습니다.') }
    finally { setIsBulkWorking(false) }
  }

  const entityColumns: AdminTableColumn<EntityRow>[] = [
    {
      key: 'name',
      header: '이름',
      cell: (entity) => (
        <div>
          <div className="font-medium text-foreground">{entity.canonical_name}</div>
          {entity.description && <div className="truncate text-xs text-muted-foreground">{entity.description}</div>}
        </div>
      ),
    },
    {
      key: 'type',
      header: '유형',
      cell: (entity) => <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', ENTITY_TYPE_CLS[entity.entity_type])}>{ENTITY_TYPE_LABEL[entity.entity_type]}</span>,
    },
    { key: 'mentions', header: '언급', align: 'center', cell: (entity) => entity.mention_count },
    {
      key: 'attributes',
      header: '속성',
      cell: (entity) => <div className="flex flex-wrap items-center gap-1">{entity.is_competitor && <StatusBadge tone="negative" label="경쟁사" />}{entity.competitor_group && <StatusBadge tone="neutral" label={entity.competitor_group} />}</div>,
    },
    {
      key: 'actions',
      header: '작업',
      align: 'right',
      cell: (entity) => (
        <div className="flex items-center justify-end gap-0.5">
          <button onClick={() => openEdit(entity)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="수정"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => { if (aliasEntityId === entity.id) { closeAliases(); return }; void openAliases(entity.id) }} className={cn('rounded p-1.5 transition-colors hover:bg-accent hover:text-foreground', aliasEntityId === entity.id ? 'bg-accent text-foreground' : 'text-muted-foreground')} title="동의어"><Tag className="h-3.5 w-3.5" /></button>
          <button onClick={() => { if (mergeSourceId === entity.id) { closeMerge(); return }; openMerge(entity.id) }} className={cn('rounded p-1.5 transition-colors hover:bg-accent hover:text-foreground', mergeSourceId === entity.id ? 'bg-accent text-foreground' : 'text-muted-foreground')} title="병합"><GitMerge className="h-3.5 w-3.5" /></button>
          <button onClick={() => { void handleDelete(entity) }} className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ]

  const typeCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.entity_type] = (acc[e.entity_type] ?? 0) + 1
    return acc
  }, {})

  // ── 폼 열기/닫기 ─────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(entity: EntityRow) {
    setForm({
      canonical_name:   entity.canonical_name,
      entity_type:      entity.entity_type,
      description:      entity.description ?? '',
      is_competitor:    entity.is_competitor,
      competitor_group: entity.competitor_group ?? '',
    })
    setEditingId(entity.id)
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
    if (!form.canonical_name.trim()) { setFormError('이름을 입력해주세요.'); return }

    setIsSaving(true)
    try {
      const competitorGroup = form.competitor_group.trim() || null
      const payload = {
        canonical_name: form.canonical_name.trim(),
        entity_type:    form.entity_type,
        description:    form.description.trim() || null,
        // 그룹 지정 시 경쟁사 자동 체크(224 §2-4) — 수동 체크 해제도 유지
        is_competitor:  form.is_competitor || Boolean(competitorGroup),
        // 224 SQL 미적용 시 컬럼 자체가 없어 payload에 넣으면 저장이 실패하므로 제외(graceful)
        ...(groupSupported ? { competitor_group: competitorGroup } : {}),
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('entities')
          .update(payload)
          .eq('id', editingId)
        if (err) throw new Error(`수정 실패: ${err.message}`)
      } else {
        const { data: inserted, error: err } = await supabase
          .from('entities')
          .insert(payload)
          .select('id')
          .single()
        if (err) throw new Error(`추가 실패: ${err.message}`)
        if (inserted) {
          const { error: aliasErr } = await supabase
            .from('entity_aliases')
            .insert({ entity_id: inserted.id, alias: payload.canonical_name })
          if (aliasErr && aliasErr.code !== '23505') {
            console.warn('[EntityManager] canonical alias 등록 실패:', aliasErr.message)
          }
        }
      }

      closeForm()
      await loadEntities()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── 삭제 ─────────────────────────────────────────────────────────────────

  const handleDelete = async (entity: EntityRow) => {
    const confirmed = await confirm({ title: '엔티티 삭제', description: '삭제 시 동의어와 콘텐츠 연결도 함께 삭제됩니다.', targets: [entity.canonical_name], confirmLabel: '삭제', destructive: true })
    if (!confirmed) return
    const { error: err } = await supabase
      .from('entities')
      .delete()
      .eq('id', entity.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setEntities(prev => prev.filter(e => e.id !== entity.id))
    }
  }

  // ── 동의어 관리 ───────────────────────────────────────────────────────────

  async function openAliases(entityId: string) {
    setAliasEntityId(entityId)
    setAliasError(null)
    setIsLoadingAliases(true)
    const { data, error: err } = await supabase
      .from('entity_aliases')
      .select('id, alias, entity_id')
      .eq('entity_id', entityId)
      .order('alias')
    if (err) {
      setAliasError(`동의어 로드 실패: ${err.message}`)
    } else {
      setAliases((data ?? []) as AliasRow[])
    }
    setIsLoadingAliases(false)
  }

  function closeAliases() {
    setAliasEntityId(null)
    setAliases([])
    setAliasError(null)
  }

  const handleAddAlias = async (alias: string) => {
    setAliasError(null)
    if (!aliasEntityId) return
    const { error: err } = await supabase
      .from('entity_aliases')
      .insert({ entity_id: aliasEntityId, alias })
    if (err) {
      if (err.code === '23505') {
        setAliasError('이미 다른 엔티티에 등록된 동의어입니다.')
      } else {
        setAliasError(`추가 실패: ${err.message}`)
      }
    } else {
      await openAliases(aliasEntityId)
    }
  }

  const handleRemoveAlias = async (aliasRow: AliasRow) => {
    setAliasError(null)
    const entity = entities.find(e => e.id === aliasEntityId)
    if (entity && aliasRow.alias.toLowerCase() === entity.canonical_name.toLowerCase()) {
      const confirmed = await confirm({ title: '동의어 삭제', description: '대표 이름과 동일해 삭제하면 검색 매핑이 끊어질 수 있습니다.', targets: [aliasRow.alias], confirmLabel: '삭제', destructive: true })
      if (!confirmed) return
    }
    const { error: err } = await supabase
      .from('entity_aliases')
      .delete()
      .eq('id', aliasRow.id)
    if (err) {
      setAliasError(`삭제 실패: ${err.message}`)
    } else {
      setAliases(prev => prev.filter(a => a.id !== aliasRow.id))
    }
  }

  // ── 병합 ─────────────────────────────────────────────────────────────────

  function openMerge(entityId: string) {
    setMergeSourceId(entityId)
    setMergeSearch('')
    setMergeTargetId(null)
    setMergeError(null)
  }

  function closeMerge() {
    setMergeSourceId(null)
    setMergeSearch('')
    setMergeTargetId(null)
    setMergeError(null)
  }

  const mergeSearchResults = mergeSearch.trim()
    ? entities.filter(e =>
        e.id !== mergeSourceId &&
        e.canonical_name.toLowerCase().includes(mergeSearch.toLowerCase())
      )
    : []

  const handleMerge = async () => {
    if (!mergeSourceId || !mergeTargetId) return
    const source = entities.find(e => e.id === mergeSourceId)
    const target = entities.find(e => e.id === mergeTargetId)
    if (!source || !target) return

    const confirmed = await confirm({ title: '엔티티 병합', description: '모든 기사 연결·동의어가 이전되며 되돌릴 수 없습니다.', targets: [source.canonical_name, target.canonical_name], confirmLabel: '병합', destructive: true })
    if (!confirmed) return

    setIsMerging(true)
    setMergeError(null)
    const { error: err } = await supabase.rpc('merge_entities', {
      p_source: mergeSourceId,
      p_target: mergeTargetId,
    })
    setIsMerging(false)
    if (err) {
      setMergeError(`병합 실패: ${err.message}`)
    } else {
      closeMerge()
      await loadEntities()
    }
  }

  // ── 정규화 제안 ───────────────────────────────────────────────────────────

  const handleSuggestNorm = async () => {
    setIsLoadingNorm(true)
    setNormError(null)
    setNormGroups([])
    setDismissedNormIds(new Set())
    setApplyNormError(null)
    try {
      const res = await fetch('/api/admin/entities/suggest-normalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: normType === 'all' ? undefined : normType }),
      })
      const json = await res.json() as { groups?: NormalizationGroup[]; error?: string }
      if (!res.ok) {
        setNormError(json.error ?? '제안 생성 실패')
      } else {
        setNormGroups(json.groups ?? [])
        if ((json.groups ?? []).length === 0) {
          setNormError('중복 제안이 없습니다. (데이터가 적거나 이미 정규화됨)')
        }
      }
    } catch {
      setNormError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsLoadingNorm(false)
    }
  }

  // 폴링 시작 헬퍼
  function startNormPolling(jobId: string, appliedIds: string[]) {
    setNormJobId(jobId)
    setNormJob(null)
    if (normPollRef.current) clearInterval(normPollRef.current)

    normPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/entities/apply-normalization?jobId=${jobId}`)
        if (!res.ok) return
        const job = await res.json() as MergeJob
        setNormJob(job)
        if (job.status === 'done') {
          if (normPollRef.current) clearInterval(normPollRef.current)
          normPollRef.current = null
          setDismissedNormIds(prev => new Set([...prev, ...appliedIds]))
          await loadEntities()
        }
      } catch { /* 폴링 일시 실패 무시 */ }
    }, 1500)
  }

  const handleApplyNorm = async (group: NormalizationGroup) => {
    const confirmed = await confirm({ title: '엔티티 정규화 적용', description: '같은 회사가 여러 이름으로 쪼개진 걸 합칩니다. 적용하면 되돌릴 수 없습니다.', targets: [group.canonicalName], confirmLabel: '적용', destructive: true })
    if (!confirmed) return

    setApplyNormError(null)
    try {
      const res = await fetch('/api/admin/entities/apply-normalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: [group] }),
      })
      const json = await res.json() as { jobId?: string; error?: string }
      if (!res.ok || !json.jobId) {
        setApplyNormError(`병합 실패: ${json.error ?? '알 수 없는 오류'}`)
        return
      }
      startNormPolling(json.jobId, [group.canonicalId])
    } catch {
      setApplyNormError('네트워크 오류가 발생했습니다.')
    }
  }

  const handleApplyAllNorm = async () => {
    const pending = normGroups.filter(g => !dismissedNormIds.has(g.canonicalId))
    if (pending.length === 0) return
    const confirmed = await confirm({ title: '엔티티 정규화 일괄 적용', description: '제안된 그룹을 모두 병합하며 되돌릴 수 없습니다.', targets: pending.map((group) => group.canonicalName), confirmLabel: '모두 적용', destructive: true })
    if (!confirmed) return

    setApplyNormError(null)
    try {
      const res = await fetch('/api/admin/entities/apply-normalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: pending }),
      })
      const json = await res.json() as { jobId?: string; error?: string }
      if (!res.ok || !json.jobId) {
        setApplyNormError(`전체 병합 실패: ${json.error ?? '알 수 없는 오류'}`)
        return
      }
      startNormPolling(json.jobId, pending.map(g => g.canonicalId))
    } catch {
      setApplyNormError('네트워크 오류가 발생했습니다.')
    }
  }

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => { if (normPollRef.current) clearInterval(normPollRef.current) }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────

  const aliasEntity       = aliasEntityId  ? entities.find(e => e.id === aliasEntityId)  : null
  const mergeSourceEntity = mergeSourceId  ? entities.find(e => e.id === mergeSourceId)  : null
  const mergeTargetEntity = mergeTargetId  ? entities.find(e => e.id === mergeTargetId)  : null

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <AdminErrorBox onDismiss={() => setError(null)}>
          <span>{error}</span>
        </AdminErrorBox>
      )}

      {/* ── 정규화 제안 패널 토글 버튼 ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setShowNormPanel(p => !p); setNormError(null) }}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            showNormPanel
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          정규화 제안
        </button>
      </div>

      {/* ── 정규화 제안 패널 ── */}
      {showNormPanel && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  LLM 정규화 제안
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  같은 회사가 여러 이름으로 쪼개진 걸 합칩니다. 적용하면 되돌릴 수 없어요.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowNormPanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground">엔티티 유형</span>
                <Select
                  value={normType}
                  onValueChange={(v) => setNormType(v as EntityType | 'all')}
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {ENTITY_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{ENTITY_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => { void handleSuggestNorm() }}
                disabled={isLoadingNorm || normJobId !== null && normJob?.status !== 'done'}
              >
                {isLoadingNorm
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />분석 중…</>
                  : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />제안 생성</>
                }
              </Button>
              {normGroups.filter(g => !dismissedNormIds.has(g.canonicalId)).length > 1 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { void handleApplyAllNorm() }}
                  disabled={normJobId !== null && normJob?.status !== 'done'}
                >
                  <GitMerge className="mr-1.5 h-3.5 w-3.5" />
                  전체 병합 적용
                </Button>
              )}
            </div>

            {normError && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                {normError}
              </div>
            )}

            {applyNormError && (
              <AdminErrorBox className="text-xs">
                {applyNormError}
              </AdminErrorBox>
            )}

            {normJob && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {normJob.status === 'done'
                      ? `완료 — ${normJob.merged}건 병합 · ${normJob.aliasAdded}개 동의어 · 실패 ${normJob.errors.length}`
                      : `병합 중… ${normJob.done} / ${normJob.total}`
                    }
                  </span>
                  {normJob.status === 'done' && (
                    <button
                      onClick={() => { setNormJobId(null); setNormJob(null) }}
                      className="text-muted-foreground/60 underline hover:text-foreground"
                    >
                      닫기
                    </button>
                  )}
                </div>
                <Progress
                  value={normJob.total > 0 ? (normJob.done / normJob.total) * 100 : 0}
                  className="h-1.5"
                />
                {normJob.errors.length > 0 && (
                  <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 space-y-0.5">
                    {normJob.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </div>
            )}

            {normGroups.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {normGroups.filter(g => !dismissedNormIds.has(g.canonicalId)).length}개 제안
                </p>
                {normGroups
                  .filter(g => !dismissedNormIds.has(g.canonicalId))
                  .map(group => {
                    const isRunning = normJobId !== null && normJob?.status !== 'done'
                    const confidencePct = Math.round(group.confidence * 100)
                    return (
                      <div key={group.canonicalId} className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{group.canonicalName}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{group.reason}</p>
                          </div>
                          <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums',
                            group.confidence >= 0.9
                              ? 'bg-positive-soft text-positive'
                              : 'bg-amber-50 text-amber-700'
                          )}>
                            신뢰도 {confidencePct}%
                          </span>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[11px] text-muted-foreground/70">병합될 엔티티</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.mergeIds.map(id => {
                              const ent = entities.find(e => e.id === id)
                              return (
                                <StatusBadge key={id} tone="negative" label={ent?.canonical_name ?? id} />
                              )
                            })}
                          </div>
                        </div>

                        {group.newAliases.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[11px] text-muted-foreground/70">추가 동의어</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.newAliases.map(alias => (
                                <span
                                  key={alias}
                                  className="inline-flex items-center rounded-full border bg-accent px-2.5 py-0.5 text-xs text-foreground"
                                >
                                  {alias}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDismissedNormIds(prev => new Set([...prev, group.canonicalId]))}
                            disabled={isRunning}
                          >
                            무시
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isRunning}
                            onClick={() => { void handleApplyNorm(group) }}
                          >
                            {isRunning
                              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />병합 중…</>
                              : '병합 적용'
                            }
                          </Button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 생성/수정 폼 ── */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {editingId ? '엔티티 수정' : '새 엔티티 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { void handleSave(e) }} className="space-y-5">
              {formError && (
                <AdminErrorBox>
                  {formError}
                </AdminErrorBox>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ent-name">
                    이름 (canonical_name) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ent-name"
                    value={form.canonical_name}
                    onChange={(e) => setForm(p => ({ ...p, canonical_name: e.target.value }))}
                    placeholder="예: Microsoft"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ent-type">유형</Label>
                  <Select
                    value={form.entity_type}
                    onValueChange={(v) => setForm(p => ({ ...p, entity_type: v as EntityType }))}
                  >
                    <SelectTrigger id="ent-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{ENTITY_TYPE_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ent-desc">
                  설명{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <Input
                  id="ent-desc"
                  value={form.description}
                  onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="이 엔티티에 대한 간단한 설명"
                />
              </div>
              <div className="flex items-center">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_competitor}
                    onChange={(e) => setForm(p => ({ ...p, is_competitor: e.target.checked }))}
                    className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                  />
                  <span className="text-sm text-foreground">경쟁사</span>
                </label>
              </div>
              {groupSupported && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ent-competitor-group">
                    경쟁사 그룹(동향){' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택, 자유 입력 — 지정 시 경쟁사 자동 체크)</span>
                  </Label>
                  <Input
                    id="ent-competitor-group"
                    list="competitor-group-suggestions"
                    value={form.competitor_group}
                    onChange={(e) => setForm(p => ({ ...p, competitor_group: e.target.value }))}
                    placeholder="예: 통신 / 클라우드·플랫폼 / 빅테크"
                  />
                  <datalist id="competitor-group-suggestions">
                    {COMPETITOR_GROUP_SUGGESTIONS.map(g => <option key={g} value={g} />)}
                  </datalist>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>취소</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중…</>
                    : editingId ? '수정 저장' : '엔티티 추가'
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 동의어 관리 패널 ── */}
      {aliasEntityId && aliasEntity && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                동의어 관리 — {aliasEntity.canonical_name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={closeAliases}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {aliasError && (
              <AdminErrorBox onDismiss={() => setAliasError(null)}>
                <span>{aliasError}</span>
              </AdminErrorBox>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>동의어 목록</Label>
              {isLoadingAliases ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />불러오는 중…
                </div>
              ) : (
                <AliasChipInput
                  chips={aliases.map(a => a.alias)}
                  onAdd={(alias) => { void handleAddAlias(alias) }}
                  onRemove={(alias) => {
                    const row = aliases.find(a => a.alias === alias)
                    if (row) void handleRemoveAlias(row)
                  }}
                  placeholder="동의어 추가 (Enter 또는 , )"
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              canonical_name과 동일한 동의어는 삭제하지 않는 것을 권장합니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── 병합 패널 ── */}
      {mergeSourceId && mergeSourceEntity && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-destructive">
                다른 엔티티로 병합 — {mergeSourceEntity.canonical_name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={closeMerge}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {mergeError && (
              <AdminErrorBox>
                {mergeError}
              </AdminErrorBox>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="merge-search">병합 대상 검색</Label>
              <Input
                id="merge-search"
                value={mergeSearch}
                onChange={(e) => { setMergeSearch(e.target.value); setMergeTargetId(null) }}
                placeholder="병합될 엔티티 이름 검색…"
              />
            </div>
            {mergeSearchResults.length > 0 && (
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {mergeSearchResults.slice(0, 8).map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setMergeTargetId(e.id); setMergeSearch(e.canonical_name) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                      mergeTargetId === e.id && 'bg-accent'
                    )}
                  >
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      ENTITY_TYPE_CLS[e.entity_type]
                    )}>
                      {ENTITY_TYPE_LABEL[e.entity_type]}
                    </span>
                    {e.canonical_name}
                  </button>
                ))}
              </div>
            )}
            {mergeTargetId && mergeTargetEntity && (
              <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
                ⚠️ &ldquo;{mergeSourceEntity.canonical_name}&rdquo;의 모든 기사 연결과 동의어가
                &ldquo;{mergeTargetEntity.canonical_name}&rdquo;으로 이전되며{' '}
                <strong>되돌릴 수 없습니다.</strong>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeMerge}>취소</Button>
              <Button
                variant="destructive"
                disabled={!mergeTargetId || isMerging}
                onClick={() => { void handleMerge() }}
              >
                {isMerging
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />병합 중…</>
                  : '병합 실행'
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 타입 필터 + 검색 + 추가 버튼 (209 — 공유 세그먼트 박스로 통일) ── */}
      <div className="space-y-3">
        <AdminTabs
          items={(['all', ...ENTITY_TYPES] as const).map((t) => {
            const count = t === 'all' ? entities.length : (typeCounts[t] ?? 0)
            return {
              value: t,
              label: t === 'all' ? '전체' : ENTITY_TYPE_LABEL[t],
              count,
              disabled: count === 0 && t !== 'all',
            }
          })}
          value={filterType}
          onChange={(v) => setFilterType(v as EntityType | 'all')}
          aria-label="엔티티 타입"
        />
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름 또는 동의어 검색…"
              className="pr-8"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null) }}
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
              엔티티 추가
            </Button>
          )}
        </div>
      </div>

      {/* ── 목록 카운트 ── */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? '불러오는 중…' : `${visibleEntities.length}개 표시 (전체 ${entities.length}개)`}
      </p>

      {/* ── 목록 테이블 ── */}
      {table.selected.size > 0 && <AdminSelectionBar count={table.selected.size}>
        <Button size="sm" variant="outline" disabled={isBulkWorking} onClick={() => { void handleBulkCompetitor(true) }}>경쟁사 지정</Button>
        <Button size="sm" variant="outline" disabled={isBulkWorking} onClick={() => { void handleBulkCompetitor(false) }}>경쟁사 해제</Button>
      </AdminSelectionBar>}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />불러오는 중…
        </div>
      ) : visibleEntities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {searchQuery ? '검색 결과가 없습니다.' : '등록된 엔티티가 없습니다.'}
        </div>
      ) : (
        <AdminTable
          columns={entityColumns}
          rows={visibleEntities}
          rowKey={(entity) => entity.id}
          minWidth="min-w-[720px]"
          state={isLoading ? 'loading' : error ? 'error' : visibleEntities.length === 0 ? 'empty' : 'idle'}
          errorMessage={error ?? undefined}
          emptyMessage={searchQuery ? '검색 결과가 없습니다.' : '등록된 엔티티가 없습니다.'}
          selection={{ selected: table.selected, onChange: table.setSelected }}
        />
      )}
    </div>
  )
}
