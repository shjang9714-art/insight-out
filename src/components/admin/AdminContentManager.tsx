'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_DEFS, toDbCategories } from '@/lib/categories'
import {
  CONTENT_CATEGORY_LABEL,
  type ContentCategory,
  type ContentStatus,
  type SourceType,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface AdminContentRow {
  id: string
  title: string
  category: ContentCategory
  status: ContentStatus
  collected_at: string
  sources: { name: string } | null
}

interface SourceOption {
  id: string
  name: string
  type: SourceType
}

interface EditState {
  id: string
  title: string
  summary: string
  category: ContentCategory
  sourceId: string // '' = 없음
  author: string
  publishedAt: string // 'YYYY-MM-DD' 또는 ''
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const STATUS_STYLE: Record<ContentStatus, { label: string; className: string }> = {
  published: { label: '노출',      className: 'border-green-100 bg-green-50 text-green-700' },
  pending:   { label: '검토 대기', className: 'border-yellow-100 bg-yellow-50 text-yellow-700' },
  rejected:  { label: '숨김',      className: 'border-red-100 bg-red-50 text-red-600' },
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// 소스 필터 특수값
const SOURCE_ALL = 'all'
const SOURCE_NULL = 'null' // Google News 키워드 검색 수집물 (source_id is null)
// 편집 폼에서 "없음" 출처
const EMPTY_SOURCE_VALUE = 'none'

// 카테고리 → 매칭되는 소스 타입 (필터 드롭다운을 해당 타입으로 좁힘)
const CATEGORY_SOURCE_TYPE: Partial<Record<ContentCategory, SourceType>> = {
  '뉴스':      'news_site',
  '리포트':    'report_publisher',
  '웹인사이트': 'web_insight',
  '유튜브':    'youtube_channel',
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** timestamptz / date 문자열 → date input 용 YYYY-MM-DD */
function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export default function AdminContentManager() {
  const supabase = createClient()

  const [contents,       setContents]       = useState<AdminContentRow[]>([])
  const [isLoading,      setIsLoading]      = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [pendingCount,   setPendingCount]   = useState<number | null>(null)
  const [totalCount,     setTotalCount]     = useState(0)

  // 필터
  const [category,     setCategory]     = useState('all')
  const [sourceId,     setSourceId]     = useState(SOURCE_ALL)
  const [status,       setStatus]       = useState('all')
  const [searchTerm,   setSearchTerm]   = useState('')
  const [debouncedTerm, setDebouncedTerm] = useState('')

  // 소스 목록 (필터·편집 공용)
  const [sources, setSources] = useState<SourceOption[]>([])

  // 페이지네이션
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // per-row 작업
  const [workingId,     setWorkingId]     = useState<string | null>(null)
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [isBulkWorking, setIsBulkWorking] = useState(false)

  // 편집 모달
  const [edit,        setEdit]        = useState<EditState | null>(null)
  const [isSaving,    setIsSaving]    = useState(false)
  const [editError,   setEditError]   = useState<string | null>(null)

  // 수집 기사 비우기
  const [isPurging,   setIsPurging]   = useState(false)
  const [purgeResult, setPurgeResult] = useState<string | null>(null)

  // 유튜브 비우기
  const [isYtPurging,   setIsYtPurging]   = useState(false)
  const [ytPurgeResult, setYtPurgeResult] = useState<string | null>(null)

  // ── 검색 디바운스 (300ms) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedTerm(searchTerm)
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [searchTerm])

  // ── 검토 대기 카운트 (마운트 1회) ────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 소스 목록 (마운트 1회) ──────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('sources')
      .select('id, name, type')
      .order('name')
      .then(({ data }) => setSources((data ?? []) as SourceOption[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 콘텐츠 로드 (서버 페이지네이션) ─────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      setSelectedIds(new Set())
      setError(null)

      let q = supabase
        .from('contents')
        .select('id, title, category, status, collected_at, sources(name)', { count: 'exact' })
        .order('collected_at', { ascending: false })

      if (status !== 'all')          q = q.eq('status', status as ContentStatus)
      if (category !== 'all') {
        const dbCats = toDbCategories(category as ContentCategory)
        if (dbCats.length === 1) q = q.eq('category', dbCats[0])
        else if (dbCats.length > 1) q = q.in('category', dbCats)
        else q = q.eq('category', '__none__' as ContentCategory)
      }
      if (sourceId === SOURCE_NULL)  q = q.is('source_id', null)
      else if (sourceId !== SOURCE_ALL) q = q.eq('source_id', sourceId)
      if (debouncedTerm.trim())      q = q.ilike('title', `%${debouncedTerm.trim()}%`)

      q = q.range((page - 1) * pageSize, page * pageSize - 1)

      const { data, count, error: loadError } = await q
      if (loadError) {
        setError(`콘텐츠 목록을 불러오지 못했습니다: ${loadError.message}`)
      } else {
        setContents((data ?? []) as unknown as AdminContentRow[])
        setTotalCount(count ?? 0)
      }
      setIsLoading(false)
    }
    void run()
  }, [status, category, sourceId, debouncedTerm, page, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── per-row 상태 변경 ────────────────────────────────────────────────────
  const handleStatusChange = async (content: AdminContentRow, nextStatus: ContentStatus) => {
    setWorkingId(content.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('contents')
      .update({ status: nextStatus })
      .eq('id', content.id)

    if (updateError) {
      setError(`상태 변경에 실패했습니다: ${updateError.message}`)
    } else {
      setContents((prev) => prev.map((item) =>
        item.id === content.id ? { ...item, status: nextStatus } : item
      ))
      if (nextStatus !== 'pending') {
        setPendingCount((c) => (c !== null && content.status === 'pending' ? c - 1 : c))
      }
    }
    setWorkingId(null)
  }

  const handleDelete = async (content: AdminContentRow) => {
    if (!window.confirm(`"${content.title}" 콘텐츠를 삭제하시겠습니까?`)) return
    setWorkingId(content.id)
    setError(null)
    const { error: deleteError } = await supabase
      .from('contents').delete().eq('id', content.id)

    if (deleteError) {
      setError(`콘텐츠 삭제에 실패했습니다: ${deleteError.message}`)
    } else {
      setContents((prev) => prev.filter((item) => item.id !== content.id))
      setTotalCount((c) => Math.max(0, c - 1))
      if (content.status === 'pending') {
        setPendingCount((c) => (c !== null ? c - 1 : c))
      }
    }
    setWorkingId(null)
  }

  // ── 편집 모달 열기 (행 전체 메타 로드) ──────────────────────────────────
  const openEdit = async (content: AdminContentRow) => {
    setEditError(null)
    setWorkingId(content.id)
    const { data, error: loadError } = await supabase
      .from('contents')
      .select('id, title, summary_ko, category, source_id, author, published_at')
      .eq('id', content.id)
      .single()
    setWorkingId(null)

    if (loadError || !data) {
      setError(`편집할 콘텐츠를 불러오지 못했습니다: ${loadError?.message ?? '알 수 없는 오류'}`)
      return
    }
    setEdit({
      id:          data.id,
      title:       data.title ?? '',
      summary:     data.summary_ko ?? '',
      category:    data.category as ContentCategory,
      sourceId:    data.source_id ?? '',
      author:      data.author ?? '',
      publishedAt: toDateInput(data.published_at),
    })
  }

  // ── 편집 저장 ────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!edit) return
    const title = edit.title.trim()
    if (!title) { setEditError('제목을 입력해주세요.'); return }

    setIsSaving(true)
    setEditError(null)

    const { error: updateError } = await supabase
      .from('contents')
      .update({
        title,
        summary_ko:   edit.summary.trim() || null,
        category:     edit.category,
        source_id:    edit.sourceId || null,
        author:       edit.author.trim() || null,
        published_at: edit.publishedAt || null,
      })
      .eq('id', edit.id)

    if (updateError) {
      setEditError(`저장에 실패했습니다: ${updateError.message}`)
      setIsSaving(false)
      return
    }

    // 목록에 반영 (제목·카테고리·소스명)
    const nextSourceName = edit.sourceId
      ? (sources.find((s) => s.id === edit.sourceId)?.name ?? null)
      : null
    setContents((prev) => prev.map((item) =>
      item.id === edit.id
        ? { ...item, title, category: edit.category, sources: nextSourceName ? { name: nextSourceName } : null }
        : item
    ))
    setIsSaving(false)
    setEdit(null)
  }

  // ── 일괄 선택 (현재 페이지 기준) ─────────────────────────────────────────
  const allPageIds  = contents.map((c) => c.id)
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id))
  const someSelected = allPageIds.some((id) => selectedIds.has(id)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allPageIds))
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // ── 일괄 처리 ─────────────────────────────────────────────────────────────
  const handleBulkStatus = async (nextStatus: ContentStatus) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setIsBulkWorking(true)
    setError(null)

    const { error: bulkError } = await supabase
      .from('contents')
      .update({ status: nextStatus })
      .in('id', ids)

    if (bulkError) {
      setError(`일괄 처리에 실패했습니다: ${bulkError.message}`)
    } else {
      setContents((prev) => prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, status: nextStatus } : item
      ))
      setSelectedIds(new Set())
      const { count } = await supabase
        .from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      setPendingCount(count ?? 0)
    }
    setIsBulkWorking(false)
  }

  const handlePurge = async () => {
    setIsPurging(true)
    setError(null)
    setPurgeResult(null)
    try {
      // 1단계: 건수 조회
      const countRes = await fetch('/api/admin/contents/purge')
      if (!countRes.ok) throw new Error((await countRes.json()).error ?? '건수 조회 실패')
      const { count } = await countRes.json() as { count: number }

      // 2단계: 확인 다이얼로그
      const confirmed = window.confirm(
        `크롤링 기사 ${count.toLocaleString()}건을 삭제합니다.\n업로드한 리포트·AI보고서·유튜브는 보존됩니다.\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
      )
      if (!confirmed) { setIsPurging(false); return }

      // 실행
      const delRes = await fetch('/api/admin/contents/purge', { method: 'POST' })
      if (!delRes.ok) throw new Error((await delRes.json()).error ?? '삭제 실패')
      const { deleted } = await delRes.json() as { deleted: number }

      setPurgeResult(`${deleted.toLocaleString()}건 삭제 완료`)
      setPage(1)
      // pending 카운트 및 목록 새로고침
      supabase
        .from('contents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count: c }) => setPendingCount(c ?? 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : '비우기 중 오류가 발생했습니다.')
    } finally {
      setIsPurging(false)
    }
  }

  const handleYoutubePurge = async () => {
    setIsYtPurging(true)
    setYtPurgeResult(null)
    setError(null)
    try {
      const countRes = await fetch('/api/admin/youtube/purge')
      if (!countRes.ok) throw new Error((await countRes.json()).error ?? '건수 조회 실패')
      const { count } = await countRes.json() as { count: number }

      const confirmed = window.confirm(
        `유튜브 영상 ${count.toLocaleString()}건을 삭제합니다.\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
      )
      if (!confirmed) { setIsYtPurging(false); return }

      const delRes = await fetch('/api/admin/youtube/purge', { method: 'POST' })
      if (!delRes.ok) throw new Error((await delRes.json()).error ?? '삭제 실패')
      const { deleted } = await delRes.json() as { deleted: number }

      setYtPurgeResult(`유튜브 ${deleted.toLocaleString()}건 삭제 완료`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '유튜브 비우기 중 오류가 발생했습니다.')
    } finally {
      setIsYtPurging(false)
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  // 카테고리 탭 (전체 + CATEGORY_DEFS)
  const categoryTabs: { value: string; label: string }[] = [
    { value: 'all', label: '전체' },
    ...CATEGORY_DEFS.map((d) => ({ value: d.category, label: d.label })),
  ]

  // 선택된 카테고리에 맞는 소스만 (없으면 전체)
  const mappedType = category !== 'all'
    ? CATEGORY_SOURCE_TYPE[category as ContentCategory]
    : undefined
  const sourceOptions = mappedType ? sources.filter((s) => s.type === mappedType) : sources

  // 편집 폼 카테고리 옵션 (실제 DB enum 값만, deprecated는 현재 행 값이면 추가)
  const EDIT_CATEGORY_OPTIONS: ContentCategory[] = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서']
  const editCategoryExtra =
    edit && !EDIT_CATEGORY_OPTIONS.includes(edit.category) ? [edit.category] : []

  if (isLoading && contents.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        콘텐츠를 불러오는 중입니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      {/* ── 검토 대기 칩 + 수집 기사 비우기 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {pendingCount !== null && pendingCount > 0 && (
            <button
              onClick={() => { setStatus('pending'); setPage(1) }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                status === 'pending'
                  ? 'border-yellow-400 bg-yellow-400 text-white'
                  : 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
              )}
            >
              ⏳ 검토 대기 {pendingCount}건
            </button>
          )}
          {pendingCount === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ✅ 검토 대기 없음
            </span>
          )}
          {purgeResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ✅ {purgeResult}
            </span>
          )}
          {ytPurgeResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ✅ {ytPurgeResult}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPurging}
            onClick={handlePurge}
            className="border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50"
          >
            {isPurging
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />비우는 중…</>
              : <><Trash2 className="mr-1.5 h-3.5 w-3.5" />수집 기사 비우기</>
            }
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isYtPurging}
            onClick={handleYoutubePurge}
            className="border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50"
          >
            {isYtPurging
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />비우는 중…</>
              : <><Trash2 className="mr-1.5 h-3.5 w-3.5" />유튜브 비우기</>
            }
          </Button>
        </div>
      </div>

      {/* ── 카테고리 탭 ── */}
      <div className="flex flex-wrap gap-1.5">
        {categoryTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setCategory(tab.value); setSourceId(SOURCE_ALL); setPage(1) }}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              category === tab.value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-border bg-card text-foreground hover:border-border hover:bg-accent/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 검색·소스·상태·페이지 크기 필터 ── */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_200px_180px_100px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="제목 검색"
            className="pl-9"
          />
        </div>
        <Select value={sourceId} onValueChange={(v) => { setSourceId(v); setPage(1) }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="소스" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SOURCE_ALL}>전체 소스</SelectItem>
            <SelectItem value={SOURCE_NULL}>Google News 검색</SelectItem>
            {sourceOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {CONTENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{STATUS_STYLE[value].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}건</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── 일괄 작업 바 ── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/60 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selectedIds.size}건 선택</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('published')}
              className="text-green-700"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              일괄 보이기
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('rejected')}
              className="text-red-600"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              일괄 숨기기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBulkWorking}
              onClick={() => setSelectedIds(new Set())}
            >
              선택 해제
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isLoading ? '불러오는 중…' : `총 ${totalCount}건 · ${page} / ${totalPages} 페이지`}
      </p>

      {!isLoading && contents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          조건에 맞는 콘텐츠가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">소스</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">수집일 (KST)</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contents.map((content) => {
                const isWorking   = workingId === content.id
                const isSelected  = selectedIds.has(content.id)
                const statusStyle = STATUS_STYLE[content.status]
                return (
                  <tr
                    key={content.id}
                    className={cn(
                      'hover:bg-accent/50 transition-colors',
                      isSelected && 'bg-accent/30'
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(content.id)}
                        className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                        aria-label={`${content.title} 선택`}
                      />
                    </td>
                    <td className="max-w-md px-4 py-3 font-medium text-foreground">
                      <span className="line-clamp-2">{content.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {CONTENT_CATEGORY_LABEL[content.category]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {content.sources?.name ?? (
                        <span className="text-xs text-muted-foreground/60">Google News 검색</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        statusStyle.className
                      )}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatKst(content.collected_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button" size="sm" variant="outline"
                          disabled={isWorking || isBulkWorking}
                          onClick={() => openEdit(content)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                        {content.status !== 'published' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'published')}
                            className="text-green-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                            보이기
                          </Button>
                        )}
                        {content.status === 'published' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'rejected')}
                            className="text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                            숨기기
                          </Button>
                        )}
                        <Button
                          type="button" size="icon-sm" variant="ghost"
                          disabled={isWorking || isBulkWorking}
                          onClick={() => handleDelete(content)}
                          aria-label={`${content.title} 삭제`}
                          className="text-muted-foreground/40 hover:text-red-600"
                        >
                          {isWorking
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 페이지네이션 ── */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">총 {totalCount}건</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 편집 모달 ── */}
      <Dialog open={edit !== null} onOpenChange={(open) => { if (!open) { setEdit(null); setEditError(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>콘텐츠 수정</DialogTitle>
          </DialogHeader>

          {edit && (
            <div className="space-y-4">
              {editError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {editError}
                </div>
              )}

              {/* 제목 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-title">
                  제목 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-title"
                  value={edit.title}
                  onChange={(e) => setEdit((p) => p && { ...p, title: e.target.value })}
                  placeholder="제목을 입력해주세요"
                />
              </div>

              {/* 카테고리 + 발행일 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-category">카테고리</Label>
                  <Select
                    value={edit.category}
                    onValueChange={(v) => setEdit((p) => p && { ...p, category: v as ContentCategory })}
                  >
                    <SelectTrigger id="edit-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDIT_CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CONTENT_CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                      {editCategoryExtra.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CONTENT_CATEGORY_LABEL[c]} (구)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-published">
                    발행일{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Input
                    id="edit-published"
                    type="date"
                    value={edit.publishedAt}
                    onChange={(e) => setEdit((p) => p && { ...p, publishedAt: e.target.value })}
                  />
                </div>
              </div>

              {/* 저자 + 발행처 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-author">
                    저자/기관{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Input
                    id="edit-author"
                    value={edit.author}
                    onChange={(e) => setEdit((p) => p && { ...p, author: e.target.value })}
                    placeholder="예: Gartner Research"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-source">
                    발행처{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Select
                    value={edit.sourceId || EMPTY_SOURCE_VALUE}
                    onValueChange={(v) => setEdit((p) => p && {
                      ...p,
                      sourceId: v === EMPTY_SOURCE_VALUE ? '' : v,
                    })}
                  >
                    <SelectTrigger id="edit-source">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SOURCE_VALUE}>없음</SelectItem>
                      {sources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 요약 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-summary">
                  요약{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <textarea
                  id="edit-summary"
                  value={edit.summary}
                  onChange={(e) => setEdit((p) => p && { ...p, summary: e.target.value })}
                  placeholder="핵심 내용을 입력해주세요"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => { setEdit(null); setEditError(null) }}
            >
              취소
            </Button>
            <Button type="button" disabled={isSaving} onClick={handleEditSave}>
              {isSaving
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />저장 중…</>
                : '저장'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
