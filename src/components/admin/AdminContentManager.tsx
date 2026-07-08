'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminFilterChip from '@/components/admin/ui/AdminFilterChip'
import AdminTabs from '@/components/admin/ui/AdminTabs'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { CONTENT_STATUS_TONE, CONTENT_STATUS_LABEL, REVIEW_REASON_LABEL } from '@/lib/admin/status-style'
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
import { COLLECTED_CATEGORY_DEFS, toDbCategories, tabCategoryFor } from '@/lib/categories'
import {
  CONTENT_CATEGORY_LABEL,
  type ContentCategory,
  type ContentStatus,
  type SourceType,
} from '@/lib/types'
import { getKstTodayStartIso } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useResizableColumns, type ResizableColumnDef } from '@/lib/admin/use-resizable-columns'
import { uploadCoverFile } from '@/lib/contents/upload-cover'
import MarkdownEditor from '@/components/admin/MarkdownEditor'
import { stripMarkdown, cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

interface AdminContentRow {
  id: string
  title: string
  category: ContentCategory
  status: ContentStatus
  collected_at: string
  bookmark_count: number | null
  body_fetched_at: string | null
  body_len: number | null
  review_reason: string | null
  sources: { name: string } | null
  thumbnail_url?: string | null
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
  bodyOriginal: string
  bodyMarkdown: string
  thumbnailUrl: string | null
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// 200 — 콘텐츠 테이블 열 너비 드래그 리사이즈. 선택·관리 열은 고정(제외).
const COLUMN_WIDTHS_STORAGE_KEY = 'io:admin-contents-col-widths'
const SELECT_COL_WIDTH = 40
const MANAGE_COL_WIDTH = 340
const RESIZABLE_COLUMNS: ResizableColumnDef[] = [
  { id: 'title',     defaultWidth: 320, minWidth: 200 },
  { id: 'category',  defaultWidth: 96,  minWidth: 64 },
  { id: 'source',    defaultWidth: 140, minWidth: 90 },
  { id: 'status',    defaultWidth: 130, minWidth: 100 },
  { id: 'body',      defaultWidth: 80,  minWidth: 64 },
  { id: 'collected', defaultWidth: 150, minWidth: 110 },
]

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

function getBodyState(r: AdminContentRow): 'full' | 'snippet' | 'none' {
  if (!r.body_fetched_at) return 'none'
  if (r.body_len == null) return 'full'  // degrade: 처리됨으로 표시
  return r.body_len >= 400 ? 'full' : 'snippet'
}

const BODY_STATE_CLASS: Record<'full' | 'snippet' | 'none', string> = {
  full:    'text-positive',
  snippet: 'text-amber-600',
  none:    'text-muted-foreground',
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
  const searchParams = useSearchParams()

  // 200 — 열 너비 드래그 리사이즈(제목·카테고리·소스·상태·본문·수집일). 207 — 초기화 버튼 제거, 드래그는 유지.
  const { widths: colWidths, startResize } =
    useResizableColumns(RESIZABLE_COLUMNS, COLUMN_WIDTHS_STORAGE_KEY)

  const [contents,       setContents]       = useState<AdminContentRow[]>([])
  const [isLoading,      setIsLoading]      = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [pendingCount,   setPendingCount]   = useState<number | null>(null)
  const [totalCount,     setTotalCount]     = useState(0)

  // 필터 (URL 파라미터로 초기값 설정)
  const [category,      setCategory]      = useState(() => {
    const c = searchParams.get('category')
    return c ? tabCategoryFor(c) : 'all'
  })
  const [sourceId,      setSourceId]      = useState(() => {
    const s = searchParams.get('source')
    return s === 'null' ? SOURCE_NULL : (s ?? SOURCE_ALL)
  })
  const [status,        setStatus]        = useState(() => searchParams.get('status') ?? 'all')
  const [todayOnly,     setTodayOnly]     = useState(() => searchParams.get('from') === 'today')
  const [bookmarkedOnly, setBookmarkedOnly] = useState(() => searchParams.get('bookmarked') === '1')
  const [searchTerm,    setSearchTerm]    = useState('')
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

  // 편집 모달 — 썸네일 업로드/교체 (211)
  const [isUploadingThumb, setIsUploadingThumb] = useState(false)
  const [thumbError,       setThumbError]       = useState<string | null>(null)

  // 본문 상태 필터 + body_len degrade 추적
  const [bodyFilter,      setBodyFilter]      = useState<'all' | 'full' | 'snippet' | 'none'>('all')
  const [bodyLenAvailable, setBodyLenAvailable] = useState(true)
  const bodyLenRef = useRef(true)  // 쿼리 빌드용 (렌더 트리거 없이 최신값 유지)

  // review_reason 컬럼 가용 여부 (178, body_len 과 동일한 degrade 패턴)
  const reviewReasonRef = useRef(true)

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

      const withLen = bodyLenRef.current
      const withReason = reviewReasonRef.current
      const BASE_COLS = 'id, title, category, status, collected_at, bookmark_count, body_fetched_at'

      const buildBase = (sel: string) => {
        let q = supabase
          .from('contents')
          .select(sel, { count: 'exact' })
          .order('collected_at', { ascending: false })
        if (status !== 'all')             q = q.eq('status', status as ContentStatus)
        if (category !== 'all') {
          const dbCats = toDbCategories(category as ContentCategory)
          if (dbCats.length === 1)        q = q.eq('category', dbCats[0])
          else if (dbCats.length > 1)     q = q.in('category', dbCats)
          else                            q = q.eq('category', '__none__' as ContentCategory)
        }
        if (sourceId === SOURCE_NULL)     q = q.is('source_id', null)
        else if (sourceId !== SOURCE_ALL) q = q.eq('source_id', sourceId)
        if (debouncedTerm.trim())         q = q.ilike('title', `%${debouncedTerm.trim()}%`)
        if (todayOnly)                    q = q.gte('collected_at', getKstTodayStartIso())
        if (bookmarkedOnly)               q = q.gt('bookmark_count', 0)
        return q
      }

      const selectCols = (len: boolean, reason: boolean) =>
        [BASE_COLS, len ? 'body_len' : null, reason ? 'review_reason' : null, 'sources(name)']
          .filter(Boolean)
          .join(', ')

      const applyBodyFilter = (query: ReturnType<typeof buildBase>, len: boolean) => {
        if (bodyFilter === 'none')         return query.is('body_fetched_at', null)
        if (len && bodyFilter === 'full')    return query.not('body_fetched_at', 'is', null).gte('body_len', 400)
        if (len && bodyFilter === 'snippet') return query.not('body_fetched_at', 'is', null).lt('body_len', 400)
        return query
      }

      const runQuery = async (len: boolean, reason: boolean) => {
        let q = applyBodyFilter(buildBase(selectCols(len, reason)), len)
        q = q.range((page - 1) * pageSize, page * pageSize - 1)
        return q
      }

      let r = await runQuery(withLen, withReason)

      // Graceful fallback: review_reason 컬럼 미적용(42703) → 우선 review_reason 만 제외 후 재시도
      if (r.error?.code === '42703' && withReason) {
        reviewReasonRef.current = false
        r = await runQuery(withLen, false)
      }
      // 여전히 42703 → body_len 도 컬럼 미적용 → 함께 제외
      if (r.error?.code === '42703' && withLen) {
        bodyLenRef.current = false
        setBodyLenAvailable(false)
        r = await runQuery(false, reviewReasonRef.current)
      }

      if (r.error) {
        setError(`콘텐츠 목록을 불러오지 못했습니다: ${r.error.message}`)
      } else {
        const rows = (r.data ?? []) as unknown as AdminContentRow[]
        setContents(rows)
        setTotalCount(r.count ?? 0)
        // body_len 컬럼 실제 존재 감지
        if (!bodyLenRef.current && rows.some((row) => row.body_len != null)) {
          bodyLenRef.current = true
          setBodyLenAvailable(true)
        }
      }
      setIsLoading(false)
    }
    void run()
  }, [status, category, sourceId, debouncedTerm, page, pageSize, todayOnly, bookmarkedOnly, bodyFilter]) // eslint-disable-line react-hooks/exhaustive-deps

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
      .select('id, title, summary_ko, category, source_id, author, published_at, body_original, body_markdown, thumbnail_url')
      .eq('id', content.id)
      .single()
    setWorkingId(null)

    if (loadError || !data) {
      setError(`편집할 콘텐츠를 불러오지 못했습니다: ${loadError?.message ?? '알 수 없는 오류'}`)
      return
    }
    setThumbError(null)
    setEdit({
      id:           data.id,
      title:        data.title ?? '',
      summary:      data.summary_ko ?? '',
      category:     data.category as ContentCategory,
      sourceId:     data.source_id ?? '',
      author:       data.author ?? '',
      publishedAt:  toDateInput(data.published_at),
      bodyOriginal: data.body_original ?? '',
      bodyMarkdown: (data.body_markdown ?? '') ||
                    cleanBodyText(htmlToPlainText(data.body_original ?? '')),
      thumbnailUrl: data.thumbnail_url ?? null,
    })
  }

  // ── 편집 저장 ────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!edit) return
    const title = edit.title.trim()
    if (!title) { setEditError('제목을 입력해주세요.'); return }

    setIsSaving(true)
    setEditError(null)

    // 217 — 마크다운 원본(상세 렌더용) + stripMarkdown 평문(검색·스니펫용) 동기 기록
    const md = edit.bodyMarkdown.trim()
    const updatePayload: Record<string, unknown> = {
      title,
      summary_ko:    edit.summary.trim() || null,
      category:      edit.category,
      source_id:     edit.sourceId || null,
      author:        edit.author.trim() || null,
      published_at:  edit.publishedAt || null,
      body_markdown: md || null,
      body_original: md ? (stripMarkdown(md).trim() || null) : null,
      thumbnail_url: edit.thumbnailUrl,
    }

    let { error: updateError } = await supabase
      .from('contents')
      .update(updatePayload)
      .eq('id', edit.id)

    // body_markdown 컬럼 미적용(42703) graceful: 컬럼 없이 재시도
    if (updateError?.code === '42703') {
      delete updatePayload.body_markdown
      ;({ error: updateError } = await supabase
        .from('contents')
        .update(updatePayload)
        .eq('id', edit.id))
    }

    if (updateError) {
      setEditError(`저장에 실패했습니다: ${updateError.message}`)
      setIsSaving(false)
      return
    }

    // 목록에 반영 (제목·카테고리·소스명·썸네일)
    const nextSourceName = edit.sourceId
      ? (sources.find((s) => s.id === edit.sourceId)?.name ?? null)
      : null
    setContents((prev) => prev.map((item) =>
      item.id === edit.id
        ? {
            ...item,
            title,
            category: edit.category,
            sources: nextSourceName ? { name: nextSourceName } : null,
            thumbnail_url: edit.thumbnailUrl,
          }
        : item
    ))
    setIsSaving(false)
    setEdit(null)
  }

  // ── 편집 모달 — 썸네일 업로드/교체·제거 (211) ──────────────────────────
  const handleThumbnailUpload = async (file: File) => {
    if (!edit) return
    if (!file.type.startsWith('image/')) {
      setThumbError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setThumbError('이미지 용량은 2MB 이하여야 합니다.')
      return
    }

    setIsUploadingThumb(true)
    setThumbError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      // 216 — storage 업로드만 즉시 수행. contents.thumbnail_url 기록은 저장(handleEditSave) 시점에.
      const publicUrl = await uploadCoverFile(supabase, edit.id, file, ext)
      setEdit((p) => p && { ...p, thumbnailUrl: publicUrl })
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setIsUploadingThumb(false)
    }
  }

  const handleThumbnailRemove = () => {
    setThumbError(null)
    setEdit((p) => p && { ...p, thumbnailUrl: null })
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

  // 207 — 선택 바 삭제(벌크). 단건 handleDelete·비우기(206)와 동일 경로(supabase delete, FK cascade).
  const handleBulkDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`${ids.length}건을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return

    setIsBulkWorking(true)
    setError(null)

    const { error: bulkError } = await supabase
      .from('contents')
      .delete()
      .in('id', ids)

    if (bulkError) {
      setError(`일괄 삭제에 실패했습니다: ${bulkError.message}`)
    } else {
      const deletedPendingCount = contents.filter((c) => selectedIds.has(c.id) && c.status === 'pending').length
      setContents((prev) => prev.filter((item) => !selectedIds.has(item.id)))
      setTotalCount((c) => Math.max(0, c - ids.length))
      setPendingCount((c) => (c !== null ? Math.max(0, c - deletedPendingCount) : c))
      setSelectedIds(new Set())
    }
    setIsBulkWorking(false)
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  // 카테고리 탭 (전체 + 수집 카테고리만, 생성물 제외)
  const categoryTabs: { value: string; label: string }[] = [
    { value: 'all', label: '전체' },
    ...COLLECTED_CATEGORY_DEFS.map((d) => ({ value: d.category, label: d.label })),
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
        <AdminErrorBox onDismiss={() => setError(null)}>
          <span>{error}</span>
        </AdminErrorBox>
      )}

      {/* ── 카테고리 탭 (205 — 최상단, 209 — 공유 세그먼트 박스로 통일) ── */}
      <div className="border-b border-border pb-4">
        <AdminTabs
          items={categoryTabs}
          value={category}
          onChange={(v) => { setCategory(v); setSourceId(SOURCE_ALL); setPage(1) }}
          aria-label="카테고리"
        />
      </div>

      {/* ── 검색·소스·상태·본문 상태·페이지 크기 필터 ── */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_200px_180px_160px_100px]">
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
              <SelectItem key={value} value={value}>{CONTENT_STATUS_LABEL[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={bodyFilter} onValueChange={(v) => { setBodyFilter(v as 'all' | 'full' | 'snippet' | 'none'); setPage(1) }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="본문 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 본문</SelectItem>
            <SelectItem value="full"  disabled={!bodyLenAvailable}>풀본문</SelectItem>
            <SelectItem value="snippet" disabled={!bodyLenAvailable}>스니펫</SelectItem>
            <SelectItem value="none">미시도</SelectItem>
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

      {/* ── 활성 필터 칩 ── */}
      {(todayOnly || bookmarkedOnly || sourceId !== SOURCE_ALL || (category !== 'all' && !categoryTabs.some((t) => t.value === category))) && (
        <div className="flex flex-wrap gap-2">
          {todayOnly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              오늘 수집
              <button type="button" onClick={() => { setTodayOnly(false); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="오늘 수집 필터 제거">×</button>
            </span>
          )}
          {bookmarkedOnly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              북마크됨
              <button type="button" onClick={() => { setBookmarkedOnly(false); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="북마크 필터 제거">×</button>
            </span>
          )}
          {sourceId === SOURCE_NULL && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              소스: Google News 검색
              <button type="button" onClick={() => { setSourceId(SOURCE_ALL); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="소스 필터 제거">×</button>
            </span>
          )}
          {sourceId !== SOURCE_ALL && sourceId !== SOURCE_NULL && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              소스: {sources.find((s) => s.id === sourceId)?.name ?? sourceId.slice(0, 8)}
              <button type="button" onClick={() => { setSourceId(SOURCE_ALL); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="소스 필터 제거">×</button>
            </span>
          )}
          {category !== 'all' && !categoryTabs.some((t) => t.value === category) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              카테고리: {CONTENT_CATEGORY_LABEL[category as ContentCategory] ?? category}
              <button type="button" onClick={() => { setCategory('all'); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="카테고리 필터 제거">×</button>
            </span>
          )}
        </div>
      )}

      {/* ── 리스트 헤더: 건수/검토대기 (207 — 처리 도구·열 너비 초기화는 콘텐츠 데이터 관리로 이관) ── */}
      <div className="flex flex-wrap items-center gap-3">
        {pendingCount !== null && pendingCount > 0 && (
          <AdminFilterChip
            active={status === 'pending'}
            onClick={() => { setStatus('pending'); setPage(1) }}
            count={pendingCount}
          >
            ⏳ 검토 대기
          </AdminFilterChip>
        )}
        <p className="text-xs text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${totalCount}건 · ${page} / ${totalPages} 페이지`}
        </p>
      </div>

      {/* ── 선택 작업 바 (205 — 1개 이상 선택 시에만 sticky 등장) ── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent px-4 py-2.5 text-sm shadow-sm">
          <span className="font-medium text-foreground">{selectedIds.size}건 선택</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('published')}
              className="text-positive"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              노출
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('rejected')}
              className="border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              숨김
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={handleBulkDelete}
              className="border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              삭제
            </Button>
          </div>
        </div>
      )}

      {!isLoading && contents.length === 0 ? (
        <AdminEmptyState
          message="조건에 맞는 콘텐츠가 없습니다."
          hint="필터를 바꾸거나 수집을 실행해보세요."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table
            className="table-fixed border-collapse text-sm"
            style={{
              width: SELECT_COL_WIDTH + MANAGE_COL_WIDTH +
                RESIZABLE_COLUMNS.reduce((sum, c) => sum + (colWidths[c.id] ?? c.defaultWidth), 0),
            }}
          >
            <colgroup>
              <col style={{ width: SELECT_COL_WIDTH }} />
              {RESIZABLE_COLUMNS.map((c) => (
                <col key={c.id} style={{ width: colWidths[c.id] ?? c.defaultWidth }} />
              ))}
              <col style={{ width: MANAGE_COL_WIDTH }} />
            </colgroup>
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
                <th className="relative px-4 py-3">
                  <span className="block truncate">제목</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('title', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th className="relative px-4 py-3">
                  <span className="block truncate">카테고리</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('category', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th className="relative px-4 py-3">
                  <span className="block truncate">소스</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('source', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th className="relative px-4 py-3">
                  <span className="block truncate">상태</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('status', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th className="relative px-4 py-3">
                  <span className="block truncate">본문</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('body', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th className="relative px-4 py-3">
                  <span className="block truncate">수집일 (KST)</span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => startResize('collected', e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border active:bg-brand-600/40"
                  />
                </th>
                <th
                  className="sticky right-0 z-20 bg-muted px-4 py-3 text-right"
                  style={{ boxShadow: 'inset 1px 0 0 0 var(--border)' }}
                >
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contents.map((content) => {
                const isWorking   = workingId === content.id
                const isSelected  = selectedIds.has(content.id)
                return (
                  <tr
                    key={content.id}
                    className={cn(
                      'hover:bg-accent/50 transition-colors',
                      isSelected && 'bg-brand-600/5'
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
                    <td className="admin-cell-wrap px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/admin/contents/${content.id}`}
                        className="line-clamp-2 block hover:text-brand-600 hover:underline"
                      >
                        {content.title}
                      </Link>
                    </td>
                    <td className="truncate px-4 py-3 text-muted-foreground" title={CONTENT_CATEGORY_LABEL[content.category]}>
                      {CONTENT_CATEGORY_LABEL[content.category]}
                    </td>
                    <td className="truncate px-4 py-3 text-muted-foreground" title={content.sources?.name ?? 'Google News 검색'}>
                      {content.sources?.name ?? (
                        <span className="text-xs text-muted-foreground/60">Google News 검색</span>
                      )}
                    </td>
                    <td className="truncate px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={CONTENT_STATUS_TONE[content.status]} label={CONTENT_STATUS_LABEL[content.status]} />
                        {content.status === 'pending' && content.review_reason && (
                          <span
                            title={`검토 대기 사유: ${REVIEW_REASON_LABEL[content.review_reason] ?? content.review_reason}`}
                            className="rounded bg-risk-soft px-1.5 py-0.5 text-[11px] font-medium text-risk"
                          >
                            {REVIEW_REASON_LABEL[content.review_reason] ?? content.review_reason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="truncate px-4 py-3">
                      {(() => {
                        const bs = getBodyState(content)
                        const label = bs === 'none' ? '미시도'
                          : bs === 'snippet' ? '스니펫'
                          : bodyLenAvailable ? '풀본문' : '처리됨'
                        return (
                          <span className={cn('text-xs font-medium', BODY_STATE_CLASS[bs])}>
                            {label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="truncate px-4 py-3 text-xs text-muted-foreground">
                      {formatKst(content.collected_at)}
                    </td>
                    <td
                      className="sticky right-0 z-10 bg-card px-4 py-3"
                      style={{ boxShadow: 'inset 1px 0 0 0 var(--border)' }}
                    >
                      <div className="flex justify-end gap-1.5">
                        {content.status !== 'published' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'published')}
                            className="text-positive"
                          >
                            <Check className="h-3.5 w-3.5" />
                            노출
                          </Button>
                        )}
                        {content.status === 'published' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'rejected')}
                          >
                            <X className="h-3.5 w-3.5" />
                            숨김
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/contents/${content.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            보기
                          </Link>
                        </Button>
                        <Button
                          type="button" size="sm" variant="outline"
                          disabled={isWorking || isBulkWorking}
                          onClick={() => openEdit(content)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                        <Button
                          type="button" size="sm" variant="destructive"
                          disabled={isWorking || isBulkWorking}
                          onClick={() => handleDelete(content)}
                          aria-label={`${content.title} 삭제`}
                        >
                          {isWorking
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                          삭제
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
                <AdminErrorBox>
                  {editError}
                </AdminErrorBox>
              )}

              {/* 제목 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-title">
                  제목 <span className="text-destructive">*</span>
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

              {/* 썸네일 (211) */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-thumbnail">
                  썸네일{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {edit.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={edit.thumbnailUrl} alt="썸네일 미리보기" className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-[11px] text-muted-foreground">기본 표지 사용 중</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        id="edit-thumbnail"
                        type="file"
                        accept="image/*"
                        disabled={isUploadingThumb}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleThumbnailUpload(file)
                          e.target.value = ''
                        }}
                        className="max-w-xs"
                      />
                      {isUploadingThumb && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                      {edit.thumbnailUrl && !isUploadingThumb && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleThumbnailRemove}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          제거
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">이미지 파일, 2MB 이하. 비우면 기본 표지가 표시됩니다.</p>
                    {thumbError && <p className="text-xs text-destructive">{thumbError}</p>}
                  </div>
                </div>
              </div>

              {/* 요약 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-summary">
                  요약{' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <textarea
                  data-slot="textarea"
                  id="edit-summary"
                  value={edit.summary}
                  onChange={(e) => setEdit((p) => p && { ...p, summary: e.target.value })}
                  placeholder="핵심 내용을 입력해주세요"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* 본문 */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  본문{' '}
                  <span className="text-xs font-normal text-muted-foreground">(마크다운·선택)</span>
                </Label>
                <MarkdownEditor
                  value={edit.bodyMarkdown}
                  onChange={(v) => setEdit((p) => p && { ...p, bodyMarkdown: v })}
                  placeholder="본문을 입력·편집하세요. 툴바로 서식을 넣을 수 있어요."
                />
                <p className="text-xs text-muted-foreground">
                  서식(마크다운)은 상세 화면에 그대로 반영됩니다. 검색·요약에는 서식을 제거한 본문이 사용됩니다.
                </p>
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
