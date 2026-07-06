'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminFilterChip from '@/components/admin/ui/AdminFilterChip'
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
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const BULK_SELECTION_HINT = '콘텐츠를 1개 이상 선택하면 실행할 수 있습니다.'

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// 200 — 콘텐츠 테이블 열 너비 드래그 리사이즈. 선택·관리 열은 고정(제외).
const COLUMN_WIDTHS_STORAGE_KEY = 'io:admin-contents-col-widths'
const SELECT_COL_WIDTH = 40
const MANAGE_COL_WIDTH = 300
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

  // 200 — 열 너비 드래그 리사이즈(제목·카테고리·소스·상태·본문·수집일)
  const { widths: colWidths, startResize, resetWidths: resetColumnWidths } =
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

  // 수집 기사 비우기
  const [isPurging,   setIsPurging]   = useState(false)
  const [purgeResult, setPurgeResult] = useState<string | null>(null)

  // 유튜브 비우기
  const [isYtPurging,   setIsYtPurging]   = useState(false)
  const [ytPurgeResult, setYtPurgeResult] = useState<string | null>(null)

  // 풀본문 채우기
  const [isEnriching,   setIsEnriching]   = useState(false)
  const [enrichResult,  setEnrichResult]  = useState<string | null>(null)
  const [backfillRange, setBackfillRange] = useState<'all' | '7d' | '30d'>('30d')
  const stopRef = useRef(false)

  // 신호 분류
  const [isSignalling,  setIsSignalling]  = useState(false)
  const [signalResult,  setSignalResult]  = useState<string | null>(null)
  const signalStopRef = useRef(false)

  // 원문 URL 정규화 (196)
  const [isCanonicalizing,  setIsCanonicalizing]  = useState(false)
  const [canonicalResult,   setCanonicalResult]   = useState<string | null>(null)
  const canonicalStopRef = useRef(false)

  // 본문 상태 필터 + body_len degrade 추적
  const [bodyFilter,      setBodyFilter]      = useState<'all' | 'full' | 'snippet' | 'none'>('all')
  const [bodyLenAvailable, setBodyLenAvailable] = useState(true)
  const bodyLenRef = useRef(true)  // 쿼리 빌드용 (렌더 트리거 없이 최신값 유지)

  // review_reason 컬럼 가용 여부 (178, body_len 과 동일한 degrade 패턴)
  const reviewReasonRef = useRef(true)

  // 선택 풀본문 채우기
  const [isEnrichingSel, setIsEnrichingSel] = useState(false)

  // 목록 강제 새로고침 (enrich-by-ids 완료 후)
  const [fetchSeq, setFetchSeq] = useState(0)

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
  }, [status, category, sourceId, debouncedTerm, page, pageSize, todayOnly, bookmarkedOnly, bodyFilter, fetchSeq]) // eslint-disable-line react-hooks/exhaustive-deps

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
      .select('id, title, summary_ko, category, source_id, author, published_at, body_original')
      .eq('id', content.id)
      .single()
    setWorkingId(null)

    if (loadError || !data) {
      setError(`편집할 콘텐츠를 불러오지 못했습니다: ${loadError?.message ?? '알 수 없는 오류'}`)
      return
    }
    setEdit({
      id:           data.id,
      title:        data.title ?? '',
      summary:      data.summary_ko ?? '',
      category:     data.category as ContentCategory,
      sourceId:     data.source_id ?? '',
      author:       data.author ?? '',
      publishedAt:  toDateInput(data.published_at),
      bodyOriginal: data.body_original ?? '',
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
        summary_ko:    edit.summary.trim() || null,
        category:      edit.category,
        source_id:     edit.sourceId || null,
        author:        edit.author.trim() || null,
        published_at:  edit.publishedAt || null,
        body_original: edit.bodyOriginal.trim() || null,
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

  const handleEnrich = async () => {
    stopRef.current = false
    setIsEnriching(true)
    setEnrichResult(null)
    setError(null)

    const acc = { processed: 0, improved: 0, skipped: 0 }
    try {
      const from =
        backfillRange === '7d'  ? new Date(Date.now() - 7  * 864e5).toISOString().slice(0, 10) :
        backfillRange === '30d' ? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) :
        null

      while (true) {
        const url = `/api/admin/body-backfill?limit=30${from ? `&from=${from}` : ''}`
        const res = await fetch(url, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '풀본문 채우기 실패')
        const { processed, improved, skipped, remaining } = await res.json() as {
          processed: number; improved: number; skipped: number; remaining: number
        }
        acc.processed += processed
        acc.improved  += improved
        acc.skipped   += skipped

        if (stopRef.current) {
          setEnrichResult(`중단됨 · 누적 처리 ${acc.processed} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setEnrichResult(`완료 · 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped}`)
          break
        }
        if (processed === 0) break

        setEnrichResult(`채우는 중… 누적 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '풀본문 채우기 중 오류가 발생했습니다.')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleEnrichSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setIsEnrichingSel(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/body-backfill/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '선택 채우기 실패')
      const { processed, improved, skipped, truncated } = await res.json() as {
        processed: number; improved: number; skipped: number; truncated: boolean
      }
      setEnrichResult(
        `선택 ${processed}건 처리 · 개선 ${improved} · 실패 ${skipped}${truncated ? ' · 50건 초과분 제외' : ''}`
      )
      setSelectedIds(new Set())
      setFetchSeq((s) => s + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '선택 풀본문 채우기 중 오류가 발생했습니다.')
    } finally {
      setIsEnrichingSel(false)
    }
  }

  const handleSignalClassify = async () => {
    signalStopRef.current = false
    setIsSignalling(true)
    setSignalResult(null)
    setError(null)
    const acc = { processed: 0, tagged: 0 }
    try {
      while (true) {
        const res = await fetch('/api/admin/signals-backfill?limit=10', { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '신호 분류 실패')
        const { processed, tagged, remaining } = await res.json() as { processed: number; tagged: number; remaining: number }
        acc.processed += processed
        acc.tagged += tagged
        if (signalStopRef.current) {
          setSignalResult(`중단됨 · 누적 처리 ${acc.processed} · 신호 ${acc.tagged} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setSignalResult(`완료 · 처리 ${acc.processed} · 신호 ${acc.tagged}`)
          break
        }
        if (processed === 0) break
        setSignalResult(`분류 중… 누적 처리 ${acc.processed} · 신호 ${acc.tagged} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '신호 분류 중 오류가 발생했습니다.')
    } finally {
      setIsSignalling(false)
    }
  }

  const handleCanonicalize = async () => {
    canonicalStopRef.current = false
    setIsCanonicalizing(true)
    setCanonicalResult(null)
    setError(null)
    const acc = { processed: 0, resolved: 0, deduped: 0 }
    try {
      while (true) {
        const res = await fetch('/api/admin/canonical-backfill?limit=15')
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '원문 URL 정규화 실패')
        const { processed, resolved, deduped, remaining, ready } = await res.json() as {
          processed: number; resolved: number; deduped: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setCanonicalResult('canonical_url 컬럼이 아직 적용되지 않았습니다.')
          break
        }
        acc.processed += processed
        acc.resolved  += resolved
        acc.deduped   += deduped

        if (canonicalStopRef.current) {
          setCanonicalResult(`중단됨 · 누적 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setCanonicalResult(`완료 · 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped}`)
          break
        }
        if (processed === 0) break

        setCanonicalResult(`정규화 중… 누적 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '원문 URL 정규화 중 오류가 발생했습니다.')
    } finally {
      setIsCanonicalizing(false)
    }
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
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      {/* ── 검토 대기 칩 + 수집 기사 비우기 ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
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
          {pendingCount === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              ✅ 검토 대기 없음
            </span>
          )}
          {purgeResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              ✅ {purgeResult}
            </span>
          )}
          {ytPurgeResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              ✅ {ytPurgeResult}
            </span>
          )}
          {enrichResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              {isEnriching ? <Loader2 className="h-3 w-3 animate-spin" /> : '✅'} {enrichResult}
            </span>
          )}
          {signalResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              {isSignalling ? <Loader2 className="h-3 w-3 animate-spin" /> : '✅'} {signalResult}
            </span>
          )}
          {canonicalResult && (
            <span className="inline-flex items-center gap-1 rounded-full border border-positive/20 bg-positive-soft px-3 py-1 text-xs font-medium text-positive">
              {isCanonicalizing ? <Loader2 className="h-3 w-3 animate-spin" /> : '✅'} {canonicalResult}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
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
            <Select
              value={backfillRange}
              onValueChange={(v) => setBackfillRange(v as 'all' | '7d' | '30d')}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">최근 30일</SelectItem>
                <SelectItem value="7d">최근 7일</SelectItem>
                <SelectItem value="all">전체</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isEnriching ? () => { stopRef.current = true } : handleEnrich}
            >
              {isEnriching ? '중단' : '기사 풀본문 채우기'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isSignalling ? () => { signalStopRef.current = true } : handleSignalClassify}
            >
              {isSignalling ? '중단' : '신호 분류'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isCanonicalizing ? () => { canonicalStopRef.current = true } : handleCanonicalize}
            >
              {isCanonicalizing ? '중단' : '원문 URL 정규화'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            추출 성공률 ~60%(구글뉴스·봇차단 사이트는 구조적 실패). 탭을 열어둔 채 진행됩니다.
          </p>
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

      {/* ── 일괄 작업 바 ── */}
      {(() => {
        const noSelection = selectedIds.size === 0
        const bulkDisabledTitle = noSelection ? BULK_SELECTION_HINT : undefined
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/60 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">
              {noSelection ? '선택된 콘텐츠 없음' : `${selectedIds.size}건 선택`}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={noSelection || isBulkWorking}
                title={bulkDisabledTitle}
                onClick={() => handleBulkStatus('published')}
                className="text-positive"
              >
                {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                일괄 보이기
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={noSelection || isBulkWorking}
                title={bulkDisabledTitle}
                onClick={() => handleBulkStatus('rejected')}
                className="text-red-600"
              >
                {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                일괄 숨기기
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={noSelection || isBulkWorking || isEnrichingSel || selectedIds.size > 50}
                title={bulkDisabledTitle}
                onClick={handleEnrichSelected}
              >
                {isEnrichingSel
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />채우는 중…</>
                  : `선택 풀본문 채우기${selectedIds.size > 50 ? ' (50건 초과)' : ''}`
                }
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={noSelection || isBulkWorking || isEnrichingSel}
                onClick={() => setSelectedIds(new Set())}
              >
                선택 해제
              </Button>
            </div>
            {/* 197 — 항상 렌더링(invisible 로 토글)해 상태 전환 시 바 높이 점프 방지 */}
            <p className={cn('w-full text-xs text-muted-foreground', !noSelection && 'invisible')}>
              {BULK_SELECTION_HINT}
            </p>
          </div>
        )
      })()}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${totalCount}건 · ${page} / ${totalPages} 페이지`}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={resetColumnWidths}>
          열 너비 초기화
        </Button>
      </div>

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
                <th className="px-4 py-3 text-right">관리</th>
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
                    <td className="px-4 py-3 font-medium text-foreground">
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
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/contents/${content.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            보기
                          </Link>
                        </Button>
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
                  data-slot="textarea"
                  id="edit-summary"
                  value={edit.summary}
                  onChange={(e) => setEdit((p) => p && { ...p, summary: e.target.value })}
                  placeholder="핵심 내용을 입력해주세요"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* 본문 원문 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-body">
                  본문 (원문){' '}
                  <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                </Label>
                <textarea
                  data-slot="textarea"
                  id="edit-body"
                  value={edit.bodyOriginal}
                  onChange={(e) => setEdit((p) => p && { ...p, bodyOriginal: e.target.value })}
                  rows={12}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-600/30 resize-y"
                  placeholder="본문 원문(HTML·텍스트). 표시 시 자동 정리됩니다."
                />
                <p className="text-xs text-muted-foreground">
                  표시 화면에서 HTML·&amp;nbsp; 는 자동 정리됩니다. 여기서는 원문을 그대로 편집하세요.
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
