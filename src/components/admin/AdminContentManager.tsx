'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Eye, ImageIcon, Loader2, Pencil, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react'
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
import { uploadCoverFile } from '@/lib/contents/upload-cover'
import MarkdownEditor from '@/components/admin/MarkdownEditor'
import { stripMarkdown, cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import ContentCard from '@/components/dashboard/ContentCard'

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
  matched_keywords?: string[] | null
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
  keywords: string[]
  thumbnailUrl: string | null
  filePath: string | null
}

type EditSaveAction = 'stay' | 'next' | 'publish' | 'reject' | 'close'
type EditTab = 'card' | 'body'

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const MAX_BODY_BACKFILL_IDS = 50

// 348 — 콘텐츠 검수 테이블을 하나의 그리드로 통합.
//  · sticky 관리 열 / 열 너비 드래그(200·207) 제거 — 둘 다 고정 px 총합이 컨테이너보다 커져 가로 스크롤을 유발했다.
//  · 제목만 auto(잔여 폭 전부 흡수), 나머지는 고정 폭. 고정 폭 합 = 792px.
//  · 1440px 뷰포트 기준 본문 폭 = 1440 - 사이드바 288 - 패딩 64 = 1088px → 제목 296px 확보, 가로 스크롤 0.
//  · 테이블 min-width = 고정 폭 792 + 제목 최소 240 = 1032px (1200px 미만에선 관리 열 축소로 920px).

// 관리 버튼 공통 — 높이 32px, 1200px 미만에선 아이콘만
const ACTION_BTN = 'h-8 gap-1 rounded-md px-2 text-xs'
const ACTION_BTN_COMPACT = 'max-[1200px]:w-8 max-[1200px]:justify-center max-[1200px]:px-0'
const ACTION_LABEL_COMPACT = 'max-[1200px]:sr-only'

// 검토 사유 칩 — 테이블 셀용 축약 라벨(전체 라벨은 title 속성으로 제공)
const REVIEW_REASON_SHORT: Record<string, string> = {
  body_missing:   '본문 없음',
  body_short:     '본문 짧음',
  extract_failed: '추출 실패',
  body_truncated: '본문 잘림',
  low_relevance:  '관련도 낮음',
  llm_irrelevant: 'AI 무관',
  excluded_rule:  '제외 규칙',
}

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

interface BodyBackfillResult {
  processed: number
  improved: number
  skipped: number
  truncated: boolean
}

type BodyBackfillNoticeTone = 'success' | 'warning' | 'error'

interface BodyBackfillNotice {
  message: string
  tone: BodyBackfillNoticeTone
}

const BODY_BACKFILL_NOTICE_CLASS: Record<BodyBackfillNoticeTone, string> = {
  success: 'text-positive',
  warning: 'text-amber-600',
  error:   'text-destructive',
}

const CONTENT_ROW_BASE_SELECT =
  'id, title, category, status, collected_at, bookmark_count, body_fetched_at, matched_keywords, thumbnail_url'

function contentRowSelect(len: boolean, reason: boolean): string {
  return [
    CONTENT_ROW_BASE_SELECT,
    len ? 'body_len' : null,
    reason ? 'review_reason' : null,
    'sources(name)',
  ]
    .filter(Boolean)
    .join(', ')
}

function parseBodyBackfillResult(raw: unknown): BodyBackfillResult & { error?: string } {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    processed: typeof value.processed === 'number' ? value.processed : 0,
    improved: typeof value.improved === 'number' ? value.improved : 0,
    skipped: typeof value.skipped === 'number' ? value.skipped : 0,
    truncated: value.truncated === true,
    error: typeof value.error === 'string' ? value.error : undefined,
  }
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 348 — 테이블 셀용 짧은 KST 표기: 2026.07.14 15:12 (전체 표기는 title 속성으로) */
function formatKstCompact(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: Intl.DateTimeFormatPart['type']) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}.${get('month')}.${get('day')} ${hour}:${get('minute')}`
}

/** 348 — 본문 길이(글자 수). body_len 컬럼이 없거나 미수집이면 null */
function bodyLength(r: AdminContentRow): number | null {
  if (!r.body_fetched_at) return null
  return typeof r.body_len === 'number' ? r.body_len : null
}

/**
 * 348 — 관리 버튼 그룹. 테이블 행과 모바일 카드가 동일한 핸들러를 공유한다.
 * 순서 고정: 노출|숨김 → 보기 → 수정 → 삭제
 */
function RowActions({
  content,
  disabled,
  isWorking,
  onStatusChange,
  onEdit,
  onDelete,
  alwaysLabel = false,
}: {
  content: AdminContentRow
  disabled: boolean
  isWorking: boolean
  onStatusChange: (c: AdminContentRow, next: ContentStatus) => void
  onEdit: (c: AdminContentRow) => void
  onDelete: (c: AdminContentRow) => void
  /** true면 라벨을 항상 노출(모바일 카드). false면 1200px 미만에서 아이콘만. */
  alwaysLabel?: boolean
}) {
  const compact = alwaysLabel ? '' : ACTION_BTN_COMPACT
  const labelCls = alwaysLabel ? '' : ACTION_LABEL_COMPACT

  return (
    <div className="flex items-center justify-end gap-1">
      {content.status === 'published' ? (
        <Button
          type="button" size="sm" variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(content, 'rejected')}
          title="숨김"
          className={cn(ACTION_BTN, compact)}
        >
          <X className="h-3.5 w-3.5" />
          <span className={labelCls}>숨김</span>
        </Button>
      ) : (
        <Button
          type="button" size="sm" variant="outline"
          disabled={disabled}
          onClick={() => onStatusChange(content, 'published')}
          title="노출"
          className={cn(
            ACTION_BTN, compact,
            'border-positive/40 text-positive hover:border-positive/70 hover:bg-positive-soft hover:text-positive'
          )}
        >
          <Check className="h-3.5 w-3.5" />
          <span className={labelCls}>노출</span>
        </Button>
      )}

      <Button size="sm" variant="outline" asChild className={cn(ACTION_BTN, compact)}>
        <Link href={`/admin/contents/${content.id}`} title="보기">
          <Eye className="h-3.5 w-3.5" />
          <span className={labelCls}>보기</span>
        </Link>
      </Button>

      <Button
        type="button" size="sm" variant="outline"
        disabled={disabled}
        onClick={() => onEdit(content)}
        title="수정"
        className={cn(ACTION_BTN, compact)}
      >
        <Pencil className="h-3.5 w-3.5" />
        <span className={labelCls}>수정</span>
      </Button>

      <Button
        type="button" size="sm" variant="outline"
        disabled={disabled}
        onClick={() => onDelete(content)}
        title="삭제"
        aria-label={`${content.title} 삭제`}
        className={cn(
          ACTION_BTN, compact,
          'border-destructive/25 text-destructive/80 hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive'
        )}
      >
        {isWorking
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Trash2 className="h-3.5 w-3.5" />
        }
        <span className={labelCls}>삭제</span>
      </Button>
    </div>
  )
}

/** timestamptz / date 문자열 → date input 용 YYYY-MM-DD */
function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keywords) {
    const keyword = raw.trim().replace(/^#+/, '').trim()
    if (!keyword || seen.has(keyword)) continue
    seen.add(keyword)
    out.push(keyword)
  }
  return out
}

function serializeEditState(edit: EditState): string {
  return JSON.stringify({
    ...edit,
    title: edit.title.trim(),
    summary: edit.summary.trim(),
    author: edit.author.trim(),
    bodyMarkdown: edit.bodyMarkdown.trim(),
    keywords: normalizeKeywords(edit.keywords),
  })
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function buildReviewChecks(edit: EditState): { label: string; ok: boolean; detail: string }[] {
  const plainBody = stripMarkdown(edit.bodyMarkdown).trim()
  return [
    { label: '제목', ok: Boolean(edit.title.trim()), detail: '목록과 카드에 표시됩니다.' },
    { label: '키워드', ok: normalizeKeywords(edit.keywords).length > 0, detail: '사용자 카드의 해시태그로 표시됩니다.' },
    { label: '요약', ok: Boolean(edit.summary.trim()), detail: '카드와 상세 상단에 표시됩니다.' },
    { label: '커버', ok: Boolean(edit.thumbnailUrl || edit.title.trim()), detail: edit.thumbnailUrl ? '등록 이미지 사용' : '기본 이미지로 표시' },
    { label: '발행일', ok: Boolean(edit.publishedAt), detail: '발행일 미상 표기를 줄입니다.' },
    { label: '본문', ok: Boolean(plainBody), detail: '상세 화면과 검색 본문에 사용됩니다.' },
  ]
}

/** PDF 표지 실패 사유 한글화(291) */
const COVER_REASON_LABEL: Record<string, string> = {
  render_failed: '1페이지 렌더 실패',
  blank_page:    '1페이지가 비어 있음(스캔 PDF일 수 있음)',
  upload_failed: '저장 실패',
  update_failed: '저장 실패',
  not_pdf:       'PDF 파일이 아님',
}
function coverReasonLabel(reason?: string): string {
  if (!reason) return '알 수 없는 오류'
  return COVER_REASON_LABEL[reason] ?? reason
}

function KeywordChipInput({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (keywords: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')

  const commit = (raw: string = inputValue) => {
    const additions = raw
      .split(',')
      .map((v) => v.trim().replace(/^#+/, '').trim())
      .filter(Boolean)
    if (additions.length === 0) {
      setInputValue('')
      return
    }
    onChange(normalizeKeywords([...keywords, ...additions]))
    setInputValue('')
  }

  const remove = (keyword: string) => {
    onChange(keywords.filter((item) => item !== keyword))
  }

  return (
    <div className="rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
      <div className="flex min-h-7 flex-wrap items-center gap-1.5">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
          >
            #{keyword}
            <button
              type="button"
              onClick={() => remove(keyword)}
              className="rounded-full p-0.5 text-brand-700/70 hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-900"
              aria-label={`${keyword} 키워드 제거`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
              onChange(keywords.slice(0, -1))
            }
          }}
          placeholder={keywords.length === 0 ? '키워드 입력 후 Enter' : ''}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

export default function AdminContentManager() {
  const supabase = createClient()
  const searchParams = useSearchParams()

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
  // 291 — 표지(thumbnail_url) 없는 콘텐츠만 모아보는 필터. "사람이 개입할 길"의 핵심.
  const [coverFilter,   setCoverFilter]   = useState<'all' | 'missing'>('all')
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
  const [bodyBackfillId, setBodyBackfillId] = useState<string | null>(null)
  const [bodyBackfillNotices, setBodyBackfillNotices] =
    useState<Record<string, BodyBackfillNotice>>({})
  const [bulkBodyBackfillNotice, setBulkBodyBackfillNotice] =
    useState<BodyBackfillNotice | null>(null)

  // 편집 모달
  const [edit,        setEdit]        = useState<EditState | null>(null)
  const [isSaving,    setIsSaving]    = useState(false)
  const [editError,   setEditError]   = useState<string | null>(null)
  const [editNotice,  setEditNotice]  = useState<string | null>(null)
  const [editTab,     setEditTab]     = useState<EditTab>('card')
  const [editDirty,   setEditDirty]   = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const editSnapshotRef = useRef<string | null>(null)

  // 편집 모달 — 썸네일 업로드/교체 (211)
  const [isUploadingThumb, setIsUploadingThumb] = useState(false)
  const [thumbError,       setThumbError]       = useState<string | null>(null)

  // 편집 모달 — PDF 1페이지 다시 가져오기 (291)
  const [isRefetchingCover, setIsRefetchingCover] = useState(false)

  // 본문 상태 필터 + body_len degrade 추적
  const [bodyFilter,      setBodyFilter]      = useState<'all' | 'full' | 'snippet' | 'none'>('all')
  const [bodyLenAvailable, setBodyLenAvailable] = useState(true)
  const bodyLenRef = useRef(true)  // 쿼리 빌드용 (렌더 트리거 없이 최신값 유지)

  // review_reason 컬럼 가용 여부 (178, body_len 과 동일한 degrade 패턴)
  const reviewReasonRef = useRef(true)

  function hasUnsavedEdit(): boolean {
    return Boolean(edit && editSnapshotRef.current !== serializeEditState(edit))
  }

  function confirmDiscardEdit(): boolean {
    if (!hasUnsavedEdit()) return true
    return window.confirm('저장하지 않은 변경사항이 있습니다. 계속하면 변경사항이 사라집니다.')
  }

  function closeEdit() {
    if (!confirmDiscardEdit()) return
    setEdit(null)
    editSnapshotRef.current = null
    setEditError(null)
    setEditNotice(null)
    setThumbError(null)
    setEditDirty(false)
    setSaveMenuOpen(false)
  }

  useEffect(() => {
    setEditDirty(Boolean(edit && editSnapshotRef.current !== serializeEditState(edit)))
  }, [edit])

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
      setBodyBackfillNotices({})
      setBulkBodyBackfillNotice(null)
      setError(null)

      const withLen = bodyLenRef.current
      const withReason = reviewReasonRef.current

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
        if (coverFilter === 'missing')    q = q.is('thumbnail_url', null)
        return q
      }

      const applyBodyFilter = (query: ReturnType<typeof buildBase>, len: boolean) => {
        if (bodyFilter === 'none')         return query.is('body_fetched_at', null)
        if (len && bodyFilter === 'full')    return query.not('body_fetched_at', 'is', null).gte('body_len', 400)
        if (len && bodyFilter === 'snippet') return query.not('body_fetched_at', 'is', null).lt('body_len', 400)
        return query
      }

      const runQuery = async (len: boolean, reason: boolean) => {
        let q = applyBodyFilter(buildBase(contentRowSelect(len, reason)), len)
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
  }, [status, category, sourceId, debouncedTerm, page, pageSize, todayOnly, bookmarkedOnly, bodyFilter, coverFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshPendingCount = async () => {
    const { count } = await supabase
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingCount(count ?? 0)
  }

  const refreshContentRows = async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)].slice(0, MAX_BODY_BACKFILL_IDS)
    if (uniqueIds.length === 0) return

    const runQuery = async (len: boolean, reason: boolean) =>
      supabase
        .from('contents')
        .select(contentRowSelect(len, reason))
        .in('id', uniqueIds)

    const withLen = bodyLenRef.current
    const withReason = reviewReasonRef.current
    let r = await runQuery(withLen, withReason)

    if (r.error?.code === '42703' && withReason) {
      reviewReasonRef.current = false
      r = await runQuery(withLen, false)
    }
    if (r.error?.code === '42703' && withLen) {
      bodyLenRef.current = false
      setBodyLenAvailable(false)
      r = await runQuery(false, reviewReasonRef.current)
    }

    if (r.error) {
      setError(`본문 상태 갱신에 실패했습니다: ${r.error.message}`)
      return
    }

    const rows = (r.data ?? []) as unknown as AdminContentRow[]
    const rowMap = new Map(rows.map((row) => [row.id, row]))
    setContents((prev) => prev.map((item) => rowMap.get(item.id) ?? item))
    if (!bodyLenRef.current && rows.some((row) => row.body_len != null)) {
      bodyLenRef.current = true
      setBodyLenAvailable(true)
    }
  }

  const handleBodyBackfill = async (content: AdminContentRow) => {
    if (getBodyState(content) === 'full') return

    setBodyBackfillId(content.id)
    setError(null)
    setBodyBackfillNotices((prev) => {
      const next = { ...prev }
      delete next[content.id]
      return next
    })

    try {
      const response = await fetch('/api/admin/body-backfill/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [content.id] }),
      })
      const result = parseBodyBackfillResult(await readJsonSafe(response))

      if (!response.ok) {
        throw new Error(result.error ?? '본문 보강에 실패했습니다.')
      }

      if (result.improved > 0) {
        const now = new Date().toISOString()
        setContents((prev) => prev.map((item) =>
          item.id === content.id
            ? {
                ...item,
                body_fetched_at: now,
                body_len: bodyLenAvailable ? Math.max(item.body_len ?? 0, 400) : item.body_len,
              }
            : item
        ))
        setBodyBackfillNotices((prev) => ({
          ...prev,
          [content.id]: { message: '본문 보강 완료', tone: 'success' },
        }))
        await refreshContentRows([content.id])
        await refreshPendingCount()
      } else {
        await refreshContentRows([content.id])
        setBodyBackfillNotices((prev) => ({
          ...prev,
          [content.id]: { message: '본문을 가져오지 못했습니다', tone: 'warning' },
        }))
      }
    } catch (err) {
      setBodyBackfillNotices((prev) => ({
        ...prev,
        [content.id]: {
          message: err instanceof Error ? err.message : '본문 보강 중 오류가 발생했습니다.',
          tone: 'error',
        },
      }))
    } finally {
      setBodyBackfillId(null)
    }
  }

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
    setEditNotice(null)
    setSaveMenuOpen(false)
    setWorkingId(content.id)
    const { data, error: loadError } = await supabase
      .from('contents')
      .select('id, title, summary_ko, category, source_id, author, published_at, body_original, body_markdown, matched_keywords, thumbnail_url, file_path')
      .eq('id', content.id)
      .single()
    setWorkingId(null)

    if (loadError || !data) {
      setError(`편집할 콘텐츠를 불러오지 못했습니다: ${loadError?.message ?? '알 수 없는 오류'}`)
      return
    }
    setThumbError(null)
    setEditTab('card')
    const nextEdit: EditState = {
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
      keywords:     normalizeKeywords(Array.isArray(data.matched_keywords) ? data.matched_keywords : []),
      thumbnailUrl: data.thumbnail_url ?? null,
      filePath:     data.file_path ?? null,
    }
    editSnapshotRef.current = serializeEditState(nextEdit)
    setEditDirty(false)
    setEdit(nextEdit)
  }

  // ── 편집 저장 ────────────────────────────────────────────────────────────
  const handleEditSave = async (action: EditSaveAction = 'stay') => {
    if (!edit) return false
    const title = edit.title.trim()
    if (!title) { setEditError('제목을 입력해주세요.'); return false }

    setIsSaving(true)
    setEditError(null)
    setEditNotice(null)
    setSaveMenuOpen(false)

    // 217 — 마크다운 원본(상세 렌더용) + stripMarkdown 평문(검색·스니펫용) 동기 기록
    const md = edit.bodyMarkdown.trim()
    const keywords = normalizeKeywords(edit.keywords)
    const nextStatus: ContentStatus | null =
      action === 'publish' ? 'published' :
      action === 'reject' ? 'rejected' :
      null
    const updatePayload: Record<string, unknown> = {
      title,
      summary_ko:    edit.summary.trim() || null,
      category:      edit.category,
      source_id:     edit.sourceId || null,
      author:        edit.author.trim() || null,
      published_at:  edit.publishedAt || null,
      body_markdown: md || null,
      body_original: md ? (stripMarkdown(md).trim() || null) : null,
      matched_keywords: keywords,
      thumbnail_url: edit.thumbnailUrl,
    }
    if (nextStatus) updatePayload.status = nextStatus

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
      return false
    }

    // 목록에 반영 (제목·카테고리·소스명·썸네일)
    const nextSourceName = edit.sourceId
      ? (sources.find((s) => s.id === edit.sourceId)?.name ?? null)
      : null
    const previousRow = contents.find((item) => item.id === edit.id)
    setContents((prev) => prev.map((item) =>
      item.id === edit.id
        ? {
            ...item,
            title,
            category: edit.category,
            status: nextStatus ?? item.status,
            sources: nextSourceName ? { name: nextSourceName } : null,
            matched_keywords: keywords,
            thumbnail_url: edit.thumbnailUrl,
          }
        : item
    ))

    if (nextStatus && previousRow?.status === 'pending') {
      setPendingCount((c) => (c !== null ? Math.max(0, c - 1) : c))
    }

    setIsSaving(false)

    const savedEdit: EditState = {
      ...edit,
      title,
      summary: edit.summary.trim(),
      author: edit.author.trim(),
      bodyMarkdown: md,
      keywords,
    }

    if (action === 'close') {
      setEdit(null)
      editSnapshotRef.current = null
      setEditDirty(false)
      return true
    }

    if (action === 'next') {
      const currentIndex = contents.findIndex((item) => item.id === edit.id)
      const nextContent = currentIndex >= 0 ? contents[currentIndex + 1] : null
      if (nextContent) {
        editSnapshotRef.current = serializeEditState(savedEdit)
        await openEdit(nextContent)
        return true
      }
      setEditNotice('저장했습니다. 현재 페이지의 다음 콘텐츠가 없습니다.')
    } else if (action === 'publish') {
      setEditNotice('저장하고 노출 상태로 변경했습니다.')
    } else if (action === 'reject') {
      setEditNotice('저장하고 숨김 상태로 변경했습니다.')
    } else {
      setEditNotice('저장했습니다.')
    }

    editSnapshotRef.current = serializeEditState(savedEdit)
    setEditDirty(false)
    setEdit(savedEdit)
    return true
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

  // ── 편집 모달 — PDF 1페이지 다시 가져오기 (291) ─────────────────────────
  // 이 버튼만은 thumbnail_url이 있어도 강제로 덮어쓴다(사용자가 명시적으로 누름).
  const handleRefetchPdfCover = async () => {
    if (!edit) return
    if (!window.confirm('1페이지를 다시 가져오면 현재 표지(수동 등록분 포함)가 새 이미지로 교체됩니다. 계속할까요?')) {
      return
    }

    setIsRefetchingCover(true)
    setThumbError(null)
    try {
      const res = await fetch(`/api/admin/contents/${edit.id}/pdf-cover`, { method: 'POST' })
      const data: { ok: boolean; url?: string; reason?: string; error?: string } = await res.json()
      if (!res.ok) {
        setThumbError(data.error ?? '1페이지 다시 가져오기에 실패했습니다.')
      } else if (!data.ok) {
        setThumbError(`1페이지 다시 가져오기 실패: ${coverReasonLabel(data.reason)}`)
      } else if (data.url) {
        setEdit((p) => p && { ...p, thumbnailUrl: data.url! })
      }
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : '1페이지 다시 가져오기 중 오류가 발생했습니다.')
    } finally {
      setIsRefetchingCover(false)
    }
  }

  const handleCoverDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (isUploadingThumb) return
    const file = event.dataTransfer.files?.[0]
    if (file) void handleThumbnailUpload(file)
  }

  const handleEditNavigate = async (delta: -1 | 1) => {
    if (!edit) return
    const currentIndex = contents.findIndex((item) => item.id === edit.id)
    const nextContent = currentIndex >= 0 ? contents[currentIndex + delta] : null
    if (!nextContent) return
    if (!confirmDiscardEdit()) return
    await openEdit(nextContent)
  }

  useEffect(() => {
    if (!edit) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      void handleEditNavigate(event.key === 'ArrowLeft' ? -1 : 1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [edit, contents]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 일괄 선택 (현재 페이지 기준) ─────────────────────────────────────────
  const allPageIds  = contents.map((c) => c.id)
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id))
  const someSelected = allPageIds.some((id) => selectedIds.has(id)) && !allSelected

  const toggleAll = () => {
    setBulkBodyBackfillNotice(null)
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allPageIds))
    }
  }

  const toggleRow = (id: string) => {
    setBulkBodyBackfillNotice(null)
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

  const handleBulkBodyBackfill = async () => {
    const ids = contents
      .filter((content) => selectedIds.has(content.id) && getBodyState(content) !== 'full')
      .map((content) => content.id)

    if (ids.length === 0) {
      setBulkBodyBackfillNotice({
        message: '보강할 본문이 없습니다.',
        tone: 'warning',
      })
      return
    }

    setIsBulkWorking(true)
    setError(null)
    setBulkBodyBackfillNotice(null)

    try {
      const response = await fetch('/api/admin/body-backfill/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const result = parseBodyBackfillResult(await readJsonSafe(response))

      if (!response.ok) {
        throw new Error(result.error ?? '본문 보강에 실패했습니다.')
      }

      const processedIds = ids.slice(0, MAX_BODY_BACKFILL_IDS)
      if (result.improved > 0) {
        const now = new Date().toISOString()
        const processedSet = new Set(processedIds)
        setContents((prev) => prev.map((item) =>
          processedSet.has(item.id)
            ? {
                ...item,
                body_fetched_at: now,
                body_len: bodyLenAvailable ? Math.max(item.body_len ?? 0, 400) : item.body_len,
              }
            : item
        ))
      }
      await refreshContentRows(processedIds)
      if (result.improved > 0) {
        await refreshPendingCount()
      }

      const baseMessage = `처리 ${result.processed} · 보강 ${result.improved} · 실패 ${result.skipped}`
      setBulkBodyBackfillNotice({
        message: result.truncated
          ? `${ids.length}건 중 ${MAX_BODY_BACKFILL_IDS}건만 처리했습니다. 다시 실행하세요. ${baseMessage}`
          : baseMessage,
        tone: result.improved > 0 ? 'success' : 'warning',
      })
    } catch (err) {
      setBulkBodyBackfillNotice({
        message: err instanceof Error ? err.message : '본문 보강 중 오류가 발생했습니다.',
        tone: 'error',
      })
    } finally {
      setIsBulkWorking(false)
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1
  const selectedBackfillCount = contents.filter((content) =>
    selectedIds.has(content.id) && getBodyState(content) !== 'full'
  ).length
  const selectedBackfillHint =
    selectedBackfillCount === 0
      ? '선택한 콘텐츠는 모두 풀본문입니다.'
      : selectedBackfillCount > MAX_BODY_BACKFILL_IDS
        ? `${MAX_BODY_BACKFILL_IDS}건까지만 처리됩니다.`
        : null

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
  const editIndex = edit ? contents.findIndex((item) => item.id === edit.id) : -1
  const editPosition = editIndex >= 0 ? editIndex + 1 : 0
  const canEditPrev = editIndex > 0
  const canEditNext = editIndex >= 0 && editIndex < contents.length - 1
  const editSourceName = edit?.sourceId
    ? (sources.find((s) => s.id === edit.sourceId)?.name ?? null)
    : null
  const editReviewChecks = edit ? buildReviewChecks(edit) : []
  const editReviewWarnings = editReviewChecks.filter((check) => !check.ok)
  const editLeftPanel = edit ? (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">카드 미리보기</h3>
          <span className="text-[11px] text-muted-foreground">클릭 이동 차단</span>
        </div>
        <div className="pointer-events-none">
          <ContentCard
            id={edit.id}
            title={edit.title.trim() || '제목 미입력'}
            summaryKo={edit.summary.trim() || null}
            category={edit.category}
            sourceName={editSourceName}
            publishedAt={edit.publishedAt ? `${edit.publishedAt}T00:00:00+09:00` : null}
            thumbnailUrl={edit.thumbnailUrl}
            href={null}
            keywords={normalizeKeywords(edit.keywords)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">검수 체크</h3>
          {editReviewWarnings.length > 0 ? (
            <span className="rounded-full bg-risk-soft px-2 py-0.5 text-[11px] font-medium text-risk">
              {editReviewWarnings.length}개 확인
            </span>
          ) : (
            <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive">
              통과
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {editReviewChecks.map((check) => (
            <div
              key={check.label}
              className={cn(
                'rounded-lg border px-3 py-2',
                check.ok ? 'border-border bg-muted/40' : 'border-risk/30 bg-risk-soft/50'
              )}
            >
              <div className="flex items-center gap-1.5">
                {check.ok ? (
                  <Check className="h-3.5 w-3.5 text-positive" />
                ) : (
                  <X className="h-3.5 w-3.5 text-risk" />
                )}
                <span className="text-xs font-medium text-foreground">{check.label}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{check.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          누락 경고는 저장을 막지 않습니다.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">커버 이미지</h3>
        <div
          onDrop={handleCoverDrop}
          onDragOver={(event) => event.preventDefault()}
          className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/40"
        >
          <div className="flex aspect-[16/9] items-center justify-center bg-muted">
            {edit.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={edit.thumbnailUrl} alt="커버 미리보기" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">기본 이미지로 표시됩니다</span>
              </div>
            )}
          </div>
          <div className="space-y-2 p-3">
            <div className="flex flex-wrap gap-2">
              <label className={cn(
                'inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted',
                isUploadingThumb && 'pointer-events-none opacity-50'
              )}>
                {isUploadingThumb ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                이미지 변경
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingThumb}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleThumbnailUpload(file)
                    e.target.value = ''
                  }}
                />
              </label>
              {edit.filePath?.toLowerCase().endsWith('.pdf') && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRefetchingCover}
                  onClick={handleRefetchPdfCover}
                >
                  {isRefetchingCover && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  1페이지 다시 가져오기
                </Button>
              )}
              {edit.thumbnailUrl && (
                <Button type="button" size="sm" variant="ghost" onClick={handleThumbnailRemove}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  기본 이미지로 되돌리기
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              JPG/PNG/WebP, 2MB 이하. 파일을 이 영역에 끌어 놓아도 됩니다.
            </p>
            {thumbError && <p className="text-xs text-destructive">{thumbError}</p>}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="edit-summary">요약</Label>
        <textarea
          data-slot="textarea"
          id="edit-summary"
          value={edit.summary}
          onChange={(e) => setEdit((p) => p && { ...p, summary: e.target.value })}
          placeholder="핵심 내용을 입력해주세요"
          rows={5}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </section>

      <section className="space-y-2">
        <Label>키워드</Label>
        <KeywordChipInput
          keywords={edit.keywords}
          onChange={(keywords) => setEdit((p) => p && { ...p, keywords })}
        />
        <p className="text-[11px] text-muted-foreground">
          Enter 또는 쉼표로 추가합니다. 저장 시 `matched_keywords`에 그대로 반영됩니다.
        </p>
      </section>
    </div>
  ) : null
  const editRightPanel = edit ? (
    <div className="flex min-h-full flex-col gap-5">
      <section className="space-y-2">
        <Label htmlFor="edit-title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-title"
          value={edit.title}
          onChange={(e) => setEdit((p) => p && { ...p, title: e.target.value })}
          placeholder="제목을 입력해주세요"
          className="text-base font-medium"
        />
      </section>

      <section className="flex min-h-[620px] flex-1 flex-col gap-2">
        <Label>
          본문 <span className="text-xs font-normal text-muted-foreground">(마크다운·선택)</span>
        </Label>
        <div className="min-h-0 flex-1 [&_textarea]:min-h-[560px] [&_textarea]:resize-none">
          <MarkdownEditor
            value={edit.bodyMarkdown}
            onChange={(v) => setEdit((p) => p && { ...p, bodyMarkdown: v })}
            placeholder="본문을 입력·편집하세요. 툴바로 서식을 넣을 수 있어요."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          서식(마크다운)은 상세 화면에 그대로 반영됩니다. 검색·요약에는 서식을 제거한 본문이 사용됩니다.
        </p>
      </section>

      <details className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          출처·발행 정보
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor="edit-published">발행일</Label>
            <Input
              id="edit-published"
              type="date"
              value={edit.publishedAt}
              onChange={(e) => setEdit((p) => p && { ...p, publishedAt: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-author">저자/기관</Label>
            <Input
              id="edit-author"
              value={edit.author}
              onChange={(e) => setEdit((p) => p && { ...p, author: e.target.value })}
              placeholder="예: Gartner Research"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-source">발행처</Label>
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
      </details>
    </div>
  ) : null

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
        <Select value={coverFilter} onValueChange={(v) => { setCoverFilter(v as 'all' | 'missing'); setPage(1) }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="표지" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 표지</SelectItem>
            <SelectItem value="missing">표지 없음</SelectItem>
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
      {(todayOnly || bookmarkedOnly || coverFilter === 'missing' || sourceId !== SOURCE_ALL || (category !== 'all' && !categoryTabs.some((t) => t.value === category))) && (
        <div className="flex flex-wrap gap-2">
          {coverFilter === 'missing' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
              표지 없음
              <button type="button" onClick={() => { setCoverFilter('all'); setPage(1) }}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="표지 필터 제거">×</button>
            </span>
          )}
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
              disabled={isBulkWorking || selectedBackfillCount === 0}
              onClick={() => { void handleBulkBodyBackfill() }}
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              본문 보강
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
          {selectedBackfillHint && (
            <span className="text-xs font-medium text-muted-foreground">
              {selectedBackfillHint}
            </span>
          )}
          {bulkBodyBackfillNotice && (
            <span className={cn('text-xs font-medium', BODY_BACKFILL_NOTICE_CLASS[bulkBodyBackfillNotice.tone])}>
              {bulkBodyBackfillNotice.message}
            </span>
          )}
        </div>
      )}

      {!isLoading && contents.length === 0 ? (
        <AdminEmptyState
          message="조건에 맞는 콘텐츠가 없습니다."
          hint="필터를 바꾸거나 수집을 실행해보세요."
        />
      ) : (
        <>
          {/* ── 데스크톱: 단일 테이블 그리드 (348 — sticky 관리 열 제거, 행 배경·hover가 관리까지 이어짐) ── */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[1032px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-9" />
                <col />{/* 제목: 잔여 폭 전부 흡수 */}
                <col className="w-[68px]" />
                <col className="w-[104px]" />
                <col className="w-[140px]" />
                <col className="w-[92px]" />
                <col className="w-[112px]" />
                <col className="w-[240px]" />
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
                  <th className="px-3 py-3">제목</th>
                  <th className="px-3 py-3">카테고리</th>
                  <th className="px-3 py-3">소스</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3">본문 길이</th>
                  <th className="px-3 py-3">수집일 (KST)</th>
                  <th className="px-3 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contents.map((content) => {
                  const isWorking   = workingId === content.id
                  const isBodyBackfilling = bodyBackfillId === content.id
                  const isSelected  = selectedIds.has(content.id)
                  const bodyState = getBodyState(content)
                  const canBackfillBody = bodyState !== 'full'
                  const isRowDisabled = isWorking || isBodyBackfilling || isBulkWorking
                  const bodyBackfillNotice = bodyBackfillNotices[content.id]
                  const len = bodyLength(content)
                  const bodyText = bodyState === 'none' ? '미시도'
                    : len != null ? `${len.toLocaleString()}자`
                    : '처리됨'
                  return (
                    <tr
                      key={content.id}
                      className={cn(
                        'transition-colors hover:bg-accent/50',
                        isSelected && 'bg-brand-600/5'
                      )}
                    >
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(content.id)}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-[--color-brand-600]"
                          aria-label={`${content.title} 선택`}
                        />
                      </td>
                      <td className="admin-cell-wrap px-3 py-3 align-top font-medium text-foreground">
                        <Link
                          href={`/admin/contents/${content.id}`}
                          className="line-clamp-2 block hover:text-brand-600 hover:underline"
                        >
                          {content.title}
                        </Link>
                      </td>
                      <td className="truncate px-3 py-3 align-top text-muted-foreground" title={CONTENT_CATEGORY_LABEL[content.category]}>
                        {CONTENT_CATEGORY_LABEL[content.category]}
                      </td>
                      <td className="truncate px-3 py-3 align-top text-muted-foreground" title={content.sources?.name ?? 'Google News 검색'}>
                        {content.sources?.name ?? (
                          <span className="text-muted-foreground/60">Google News 검색</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex min-w-0 items-center gap-1">
                          <StatusBadge
                            tone={CONTENT_STATUS_TONE[content.status]}
                            label={CONTENT_STATUS_LABEL[content.status]}
                            className="shrink-0"
                          />
                          {content.status === 'pending' && content.review_reason && (
                            <span
                              title={`검토 대기 사유: ${REVIEW_REASON_LABEL[content.review_reason] ?? content.review_reason}`}
                              className="truncate rounded-full bg-risk-soft px-1.5 py-0.5 text-[11px] font-medium text-risk"
                            >
                              {REVIEW_REASON_SHORT[content.review_reason] ?? content.review_reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <span className={cn('text-xs font-medium tabular-nums', BODY_STATE_CLASS[bodyState])}>
                            {bodyText}
                          </span>
                          {canBackfillBody && (
                            <button
                              type="button"
                              disabled={isRowDisabled}
                              title="본문 보강"
                              aria-label={`${content.title} 본문 보강`}
                              onClick={() => { void handleBodyBackfill(content) }}
                              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                            >
                              {isBodyBackfilling
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RotateCcw className="h-3 w-3" />
                              }
                            </button>
                          )}
                        </div>
                        {bodyBackfillNotice && (
                          <p className={cn(
                            'mt-1 text-[11px] font-medium leading-tight',
                            BODY_BACKFILL_NOTICE_CLASS[bodyBackfillNotice.tone]
                          )}>
                            {bodyBackfillNotice.message}
                          </p>
                        )}
                      </td>
                      <td className="truncate px-3 py-3 align-top text-xs text-muted-foreground tabular-nums" title={formatKst(content.collected_at)}>
                        {formatKstCompact(content.collected_at)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <RowActions
                          content={content}
                          disabled={isRowDisabled}
                          isWorking={isWorking}
                          onStatusChange={handleStatusChange}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 카드 리스트 (348 — 테이블 축소 대신 카드로 전환) ── */}
          <ul className="space-y-3 md:hidden">
            {contents.map((content) => {
              const isWorking   = workingId === content.id
              const isBodyBackfilling = bodyBackfillId === content.id
              const isSelected  = selectedIds.has(content.id)
              const bodyState = getBodyState(content)
              const canBackfillBody = bodyState !== 'full'
              const isRowDisabled = isWorking || isBodyBackfilling || isBulkWorking
              const bodyBackfillNotice = bodyBackfillNotices[content.id]
              const len = bodyLength(content)
              const bodyText = bodyState === 'none' ? '미시도'
                : len != null ? `${len.toLocaleString()}자`
                : '처리됨'
              return (
                <li
                  key={content.id}
                  className={cn(
                    'rounded-xl border border-border bg-card p-3',
                    isSelected && 'ring-1 ring-brand-600/40'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(content.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[--color-brand-600]"
                      aria-label={`${content.title} 선택`}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/contents/${content.id}`}
                        className="line-clamp-2 block font-medium text-foreground hover:text-brand-600 hover:underline"
                      >
                        {content.title}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={CONTENT_STATUS_TONE[content.status]} label={CONTENT_STATUS_LABEL[content.status]} />
                        {content.status === 'pending' && content.review_reason && (
                          <span className="rounded-full bg-risk-soft px-1.5 py-0.5 text-[11px] font-medium text-risk">
                            {REVIEW_REASON_SHORT[content.review_reason] ?? content.review_reason}
                          </span>
                        )}
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-xs text-muted-foreground">{CONTENT_CATEGORY_LABEL[content.category]}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="truncate text-xs text-muted-foreground">{content.sources?.name ?? 'Google News 검색'}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span className={cn('font-medium tabular-nums', BODY_STATE_CLASS[bodyState])}>{bodyText}</span>
                          {canBackfillBody && (
                            <button
                              type="button"
                              disabled={isRowDisabled}
                              title="본문 보강"
                              aria-label={`${content.title} 본문 보강`}
                              onClick={() => { void handleBodyBackfill(content) }}
                              className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-40"
                            >
                              {isBodyBackfilling
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RotateCcw className="h-3 w-3" />
                              }
                            </button>
                          )}
                        </span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="tabular-nums">{formatKstCompact(content.collected_at)}</span>
                      </div>
                      {bodyBackfillNotice && (
                        <p className={cn(
                          'mt-1 text-[11px] font-medium leading-tight',
                          BODY_BACKFILL_NOTICE_CLASS[bodyBackfillNotice.tone]
                        )}>
                          {bodyBackfillNotice.message}
                        </p>
                      )}
                      <div className="mt-2.5">
                        <RowActions
                          content={content}
                          disabled={isRowDisabled}
                          isWorking={isWorking}
                          onStatusChange={handleStatusChange}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          alwaysLabel
                        />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
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
      <Dialog open={edit !== null} onOpenChange={(open) => { if (!open) closeEdit() }}>
        <DialogContent
          className="flex h-[calc(100vh-24px)] max-h-[960px] w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden p-0 sm:h-[calc(100vh-48px)] sm:w-[min(1440px,calc(100vw-64px))]"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            closeEdit()
          }}
        >
          <DialogHeader className="mb-0 shrink-0 border-b border-border px-5 py-4 pr-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle>콘텐츠 검수</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  현재 페이지 {editPosition || '-'} / {contents.length || 0}
                  {pendingCount !== null ? ` · 검토 대기 ${pendingCount}건` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canEditPrev || isSaving}
                  onClick={() => { void handleEditNavigate(-1) }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  이전
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canEditNext || isSaving}
                  onClick={() => { void handleEditNavigate(1) }}
                >
                  다음
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {edit && (
            <>
              <div className="shrink-0 border-b border-border px-5 py-3">
                {editError && (
                  <AdminErrorBox>
                    {editError}
                  </AdminErrorBox>
                )}
                {!editError && editNotice && (
                  <div className="rounded-lg border border-positive/20 bg-positive-soft px-3 py-2 text-sm text-positive">
                    {editNotice}
                  </div>
                )}
                {editDirty && (
                  <p className="mt-2 text-xs text-amber-600">
                    저장하지 않은 변경사항이 있습니다.
                  </p>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                <div className="hidden h-full grid-cols-[minmax(380px,0.38fr)_minmax(0,1fr)] lg:grid">
                  <div className="min-h-0 overflow-y-auto border-r border-border bg-muted/20 px-5 py-5">
                    {editLeftPanel}
                  </div>
                  <div className="min-h-0 overflow-y-auto px-6 py-5">
                    {editRightPanel}
                  </div>
                </div>

                <div className="flex h-full flex-col lg:hidden">
                  <div className="shrink-0 border-b border-border px-4 py-3">
                    <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
                      <button
                        type="button"
                        onClick={() => setEditTab('card')}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          editTab === 'card' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        카드·설정
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTab('body')}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          editTab === 'body' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        본문 편집
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {editTab === 'card' ? editLeftPanel : editRightPanel}
                  </div>
                </div>
              </div>
            </>
          )}

          <DialogFooter className="mt-0 shrink-0 items-center justify-between border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={closeEdit}
            >
              취소
            </Button>
            <div className="relative flex items-center gap-2">
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => { void handleEditSave(canEditNext ? 'next' : 'stay') }}
              >
                {isSaving ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />저장 중…</>
                ) : canEditNext ? (
                  '저장 후 다음 콘텐츠'
                ) : (
                  '저장'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={isSaving}
                aria-label="저장 옵션"
                aria-expanded={saveMenuOpen}
                onClick={() => setSaveMenuOpen((v) => !v)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              {saveMenuOpen && (
                <div className="absolute bottom-full right-0 z-20 mb-2 w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => { void handleEditSave('stay') }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    disabled={!canEditNext}
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => { void handleEditSave('next') }}
                  >
                    저장 후 다음 콘텐츠
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => { void handleEditSave('publish') }}
                  >
                    저장 후 노출
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => { void handleEditSave('reject') }}
                  >
                    저장 후 숨김
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => { void handleEditSave('close') }}
                  >
                    저장 후 목록으로
                  </button>
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
