'use client'

// 280 — 카탈로그(CRUD+import)만 슬림 유지. 수집 상태·품질·크롤 실행 트리거는
// /admin/source-quality(SourceQualityManager)로 이동. API 불변.

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
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { SourceType, CollectionMethod } from '@/lib/types'
import { SOURCE_TYPE_LABELS } from '@/lib/admin/source-types'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import { SourceImportDialog } from '@/components/admin/SourceImportDialog'
import AdminManualCrawl from '@/components/admin/AdminManualCrawl'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { useAdminTable } from '@/lib/admin/use-admin-table'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

// newsletter 제외 — 신규 선택 차단 (기존 row 표시는 SOURCE_TYPE_LABELS로 유지)
const SOURCE_TYPES: SourceType[] = [
  'news_site', 'report_publisher', 'web_insight', 'youtube_channel',
]

const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  rss:     'RSS',
  api:     'API',
  html:    'HTML',
  manual:  '수동',
  youtube: 'YouTube',
}

// 신규 선택 가능한 수집 방법(html·api 어댑터 미구현 — 기존 행 편집 시 현행값 유지)
const COLLECTION_METHODS: CollectionMethod[] = ['rss', 'manual', 'youtube']
const PAGE_SIZE = 20

function defaultCollectionMethod(type: SourceType): CollectionMethod {
  if (type === 'youtube_channel') return 'youtube'
  if (type === 'report_publisher') return 'manual'
  return 'rss'
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface SourceRow {
  id: string
  name: string
  type: SourceType
  url: string | null
  rss_url: string | null
  is_active: boolean
  crawl_interval_minutes: number | null
  collection_method: CollectionMethod
  last_crawled_at: string | null
  order: number
}

interface SourceForm {
  name: string
  type: SourceType
  url: string
  rss_url: string
  crawl_interval_minutes: string
  collection_method: CollectionMethod
  is_active: boolean
}

interface FeedValidationResponse {
  ok: boolean
  httpStatus: number | null
  itemCount: number
  latestPublishedAt: string | null
  sampleTitles: string[]
  error: string | null
}

interface SourceStatusInfo {
  lastError: string | null
}

const FORM_INIT: SourceForm = {
  name:                   '',
  type:                   'news_site',
  url:                    '',
  rss_url:                '',
  crawl_interval_minutes: '720',
  collection_method:      'rss',
  is_active:              true,
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
  })
}

function needsRssUrl(type: SourceType): boolean {
  return type === 'news_site' || type === 'youtube_channel' || type === 'web_insight'
}

function formatFeedDate(iso: string | null): string {
  if (!iso) return '날짜 없음'
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function feedErrorMessage(result: FeedValidationResponse): string {
  if (result.error?.startsWith('http_')) {
    const status = result.httpStatus ?? result.error.replace('http_', '')
    if (status === 404 || status === '404') return 'HTTP 404 — 주소가 유효하지 않습니다.'
    return `HTTP ${status} — 피드 요청에 실패했습니다.`
  }
  if (result.error === 'timeout') return '검증 시간이 초과되었습니다.'
  if (result.error === 'not_xml') return 'RSS 또는 Atom 형식으로 파싱할 수 없습니다.'
  if (result.error === 'no_items') return '피드에 수집 가능한 항목이 없습니다.'
  if (result.error === 'invalid_url') return 'http 또는 https 주소를 입력해주세요.'
  return '피드를 가져올 수 없습니다.'
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface SourceManagerProps {
  initialSelectedType?: SourceType | 'all'
}

export default function SourceManager({ initialSelectedType = 'all' }: SourceManagerProps) {
  const confirm = useAdminConfirm()
  const supabase = createClient()
  const table = useAdminTable({ defaultSort: { key: 'order', dir: 'asc' }, pageSize: PAGE_SIZE })

  const [sources,   setSources]   = useState<SourceRow[]>([])
  const [total,     setTotal]     = useState(0)
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [typeCounts, setTypeCounts] = useState<Record<SourceType, number>>({ news_site: 0, report_publisher: 0, web_insight: 0, youtube_channel: 0, newsletter: 0 })
  const [isLoading, setIsLoading] = useState(true)       // 초기값 true — useEffect 에서 setIsLoading(true) 호출 불필요
  const [error,     setError]     = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // 추가/수정 폼 상태 (editingId=null → 추가, string → 수정)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<SourceForm>(FORM_INIT)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [isSaving,   setIsSaving]   = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [feedValidation, setFeedValidation] = useState<FeedValidationResponse | null>(null)
  const [feedValidationUrl, setFeedValidationUrl] = useState('')
  const [isValidatingFeed, setIsValidatingFeed] = useState(false)
  const [sourceStatus, setSourceStatus] = useState<Record<string, SourceStatusInfo> | null>(null)
  const [runningSourceIds, setRunningSourceIds] = useState<Set<string>>(new Set())
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null)

  // 유형 필터 상태 (§A) — 단일 탭
  const [selectedType, setSelectedType] = useState<SourceType | 'all'>(initialSelectedType)

  // ── 목록 로드 ─────────────────────────────────────────────────────────────

  async function loadSources() {
    setIsLoading(true)
    setError(null)
    setFetchError(null)
    let query = supabase
      .from('sources')
      .select('id, name, type, url, rss_url, is_active, crawl_interval_minutes, collection_method, last_crawled_at, order', { count: 'exact' })
      .order('order', { ascending: true })
      .order('name',  { ascending: true })
    if (selectedType !== 'all') query = query.eq('type', selectedType)
    const [{ data, error: err, count }, totalResult, ...typeResults] = await Promise.all([
      query.range((table.page - 1) * PAGE_SIZE, table.page * PAGE_SIZE - 1),
      supabase.from('sources').select('id', { count: 'exact', head: true }),
      ...SOURCE_TYPES.map((type) => supabase.from('sources').select('id', { count: 'exact', head: true }).eq('type', type)),
    ])
    if (err) {
      const message = `소스 목록 로드 실패: ${err.message}`
      setError(message)
      setFetchError(message)
    } else {
      setSources((data ?? []) as SourceRow[])
      setFilteredTotal(count ?? 0)
      setTotal(totalResult.count ?? 0)
      setTypeCounts(Object.fromEntries(SOURCE_TYPES.map((type, index) => [type, typeResults[index].count ?? 0])) as Record<SourceType, number>)
      const statusResponse = await fetch('/api/admin/source-status')
      const statusData = await statusResponse.json() as Record<string, SourceStatusInfo> | { error?: string }
      setSourceStatus(statusResponse.ok ? statusData as Record<string, SourceStatusInfo> : null)
      const ids = (data ?? []).map((source) => source.id)
      if (ids.length > 0) {
        const { data: running } = await supabase.from('job_runs').select('job_key').eq('status', 'running').in('job_key', ids.map((id) => `admin:crawl-now:${id}`))
        setRunningSourceIds(new Set((running ?? []).map((row) => row.job_key.replace('admin:crawl-now:', ''))))
      } else {
        setRunningSourceIds(new Set())
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const init = async () => { await loadSources() }
    void init()
  }, [selectedType, table.page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (runningSourceIds.size === 0) return
    const timer = window.setInterval(() => { void loadSources() }, 5000)
    return () => window.clearInterval(timer)
  }, [runningSourceIds.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폼 열기/닫기 ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setFeedValidation(null)
    setFeedValidationUrl('')
    setShowForm(true)
  }

  function openEdit(src: SourceRow) {
    setForm({
      name:                   src.name,
      type:                   src.type,
      url:                    src.url  ?? '',
      rss_url:                src.rss_url ?? '',
      crawl_interval_minutes: String(src.crawl_interval_minutes ?? 720),
      collection_method:      src.collection_method,
      is_active:              src.is_active,
    })
    setEditingId(src.id)
    setFormError(null)
    setFeedValidation(null)
    setFeedValidationUrl('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
    setFeedValidation(null)
    setFeedValidationUrl('')
  }

  // ── 폼 저장 ───────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('이름을 입력해주세요.')
      return
    }

    const currentRssUrl = form.rss_url.trim()
    if (
      currentRssUrl &&
      feedValidationUrl === currentRssUrl &&
      feedValidation &&
      !feedValidation.ok
    ) {
      const confirmed = await confirm({ title: 'RSS 피드 저장 확인', description: feedErrorMessage(feedValidation), confirmLabel: '그래도 저장' })
      if (!confirmed) return
    }

    setIsSaving(true)
    try {
      const payload = {
        name:                   form.name.trim(),
        type:                   form.type,
        url:                    form.url.trim()     || null,
        rss_url:                form.rss_url.trim() || null,
        crawl_interval_minutes: form.crawl_interval_minutes
          ? parseInt(form.crawl_interval_minutes, 10)
          : null,
        collection_method: form.collection_method,
        is_active: form.is_active,
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('sources')
          .update(payload)
          .eq('id', editingId)
        if (err) throw new Error(`수정 실패: ${err.message}`)
      } else {
        const { error: err } = await supabase
          .from('sources')
          .insert(payload)
        if (err) throw new Error(`추가 실패: ${err.message}`)
      }

      closeForm()
      await loadSources()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleValidateFeed() {
    const url = form.rss_url.trim()
    if (!url) {
      setFormError('검증할 RSS URL을 입력해주세요.')
      return
    }

    setFormError(null)
    setFeedValidation(null)
    setFeedValidationUrl(url)
    setIsValidatingFeed(true)
    try {
      const res = await fetch('/api/admin/sources/validate-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as FeedValidationResponse | { error?: string }
      if (!res.ok) {
        throw new Error('error' in data && data.error ? data.error : '피드 검증에 실패했습니다.')
      }
      setFeedValidation(data as FeedValidationResponse)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '피드 검증 중 오류가 발생했습니다.')
    } finally {
      setIsValidatingFeed(false)
    }
  }

  // ── 활성 토글 (낙관적 갱신) ───────────────────────────────────────────────

  const handleToggle = async (src: SourceRow) => {
    const next = !src.is_active
    setSources(prev => prev.map(s => s.id === src.id ? { ...s, is_active: next } : s))
    const { error: err } = await supabase
      .from('sources')
      .update({ is_active: next })
      .eq('id', src.id)
    if (err) {
      // 실패 시 롤백
      setSources(prev => prev.map(s => s.id === src.id ? { ...s, is_active: src.is_active } : s))
      setError(`활성 상태 변경 실패: ${err.message}`)
    }
  }

  async function handleRecrawl(src: SourceRow) {
    if (runningSourceIds.has(src.id)) return
    setCrawlMessage(null)
    setRunningSourceIds((prev) => new Set(prev).add(src.id))
    try {
      const response = await fetch('/api/admin/crawl-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: src.id }) })
      const data = await response.json() as { error?: string }
      if (response.status === 409) {
        setCrawlMessage(data.error ?? '이미 실행 중입니다.')
        return
      }
      if (!response.ok) throw new Error(data.error ?? '재수집 요청에 실패했습니다.')
      setCrawlMessage(`${src.name} 재수집을 시작했습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '재수집 요청에 실패했습니다.')
    } finally {
      window.setTimeout(() => { void loadSources() }, 5000)
    }
  }

  // ── 삭제 ──────────────────────────────────────────────────────────────────

  const handleDelete = async (src: SourceRow) => {
    const confirmed = await confirm({ title: '소스 삭제', description: '단순 수집 중단이 목적이라면 비활성화를 권장합니다. 기존 콘텐츠·크롤링 로그는 보존됩니다.', targets: [src.name], confirmLabel: '삭제', destructive: true })
    if (!confirmed) return

    const { error: err } = await supabase
      .from('sources')
      .delete()
      .eq('id', src.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setSources(prev => prev.filter(s => s.id !== src.id))
    }
  }

  // ── RSS 경고 ──────────────────────────────────────────────────────────────

  const rssWarning = needsRssUrl(form.type) && !form.rss_url.trim()

  // ── 유형 필터 (§A) ────────────────────────────────────────────────────────

  // collection_method 선택 옵션 — 기존 행에 html·api 있으면 편집 시 현행값 표시
  const availableCollectionMethods: CollectionMethod[] =
    form.collection_method === 'html' || form.collection_method === 'api'
      ? [form.collection_method, ...COLLECTION_METHODS]
      : COLLECTION_METHODS

  const columns: AdminTableColumn<SourceRow>[] = [
    { key: 'name', header: '이름', truncate: true, width: 'max-w-[220px]', cell: (source) => <span className="font-medium text-foreground" title={source.name}>{source.name}</span> },
    { key: 'type', header: '유형', cell: (source) => <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[source.type]}</span> },
    { key: 'method', header: '수집방법', cell: (source) => <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{COLLECTION_METHOD_LABELS[source.collection_method]}</span> },
    { key: 'rss', header: 'RSS URL', width: 'max-w-[200px]', cell: (source) => source.rss_url ? <span className="block max-w-[180px] truncate text-xs text-muted-foreground" title={source.rss_url}>{source.rss_url}</span> : <span className="text-xs text-muted-foreground/40">—</span> },
    { key: 'active', header: '활성', nowrap: true, cell: (source) => <button onClick={() => handleToggle(source)} className={cn('whitespace-nowrap text-xs font-medium transition-colors', source.is_active ? 'text-positive hover:opacity-80' : 'text-muted-foreground hover:text-foreground')}>{source.is_active ? '활성' : '비활성'}</button> },
    { key: 'interval', header: '주기(분)', cell: (source) => <span className="text-xs text-muted-foreground">{source.crawl_interval_minutes ?? '—'}</span> },
    { key: 'lastCrawled', header: '마지막 수집 (KST)', nowrap: true, cell: (source) => <div className="text-xs text-muted-foreground"><div>{formatKst(source.last_crawled_at)}</div><div className="text-negative">최근 실패: {sourceStatus ? (sourceStatus[source.id]?.lastError ?? '없음') : '확인 실패'}</div></div> },
    { key: 'actions', header: '작업', align: 'right', cell: (source) => <div className="flex items-center justify-end gap-0.5"><button onClick={() => handleRecrawl(source)} disabled={runningSourceIds.has(source.id)} className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50" title="재수집">{runningSourceIds.has(source.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '재수집'}</button><button onClick={() => openEdit(source)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="수정"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(source)} className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button></div> },
  ]

  const tableState: AdminTableState = isLoading ? 'loading' : fetchError ? 'error' : filteredTotal === 0 ? 'empty' : 'idle'

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <AdminErrorBox onDismiss={() => setError(null)}>
          {error}
        </AdminErrorBox>
      )}
      {crawlMessage && <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{crawlMessage}</div>}

      {/* ── 추가/수정 폼 ── */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {editingId ? '소스 수정' : '새 소스 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <AdminErrorBox>
                  {formError}
                </AdminErrorBox>
              )}

              {/* 이름·유형 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-name">
                    이름 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="src-name"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="예: 전자신문"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-type">
                    유형 <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => {
                      const t = v as SourceType
                      setForm(p => ({
                        ...p,
                        type: t,
                        collection_method: defaultCollectionMethod(t),
                      }))
                    }}
                  >
                    <SelectTrigger id="src-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>
                          {SOURCE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 유형별 안내 */}
              {(form.type === 'news_site' || form.type === 'web_insight') && (
                <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  RSS 주소를 입력하세요. 보통 <code className="font-mono">/rss</code>, <code className="font-mono">/feed</code>, <code className="font-mono">/rss.xml</code>. Substack = <code className="font-mono">/feed</code>, Medium = <code className="font-mono">https://medium.com/feed/@핸들</code>. 못 찾으면 사이트에서 &lsquo;RSS&rsquo; 링크 확인.
                </div>
              )}
              {form.type === 'report_publisher' && (
                <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-700">
                  자동 수집하지 않습니다 — <strong>발행처 등록 전용</strong>. 콘텐츠는 [리포트 업로드]에서 추가하세요.
                </div>
              )}
              {form.type === 'youtube_channel' && (
                <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  채널 RSS: <code className="font-mono">https://www.youtube.com/feeds/videos.xml?channel_id=UC...</code><br />
                  channel_id 는 채널 페이지 &lsquo;소스 보기&rsquo;에서 <code className="font-mono">channelId</code> 검색(또는 URL 이 <code className="font-mono">/channel/UC…</code>이면 그 값). ※ 추후 키워드 검색 수집으로 대체 예정(지시서 60).
                </div>
              )}

              {/* 수집 방법 (report_publisher 는 manual 자동설정 — 숨김) */}
              {form.type !== 'report_publisher' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="src-method">수집 방법</Label>
                <Select
                  value={form.collection_method}
                  onValueChange={(v) => setForm(p => ({ ...p, collection_method: v as CollectionMethod }))}
                >
                  <SelectTrigger id="src-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCollectionMethods.map(m => (
                      <SelectItem key={m} value={m}>
                        {COLLECTION_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}

              {/* 사이트 URL · RSS URL (report_publisher 는 RSS 불필요) */}
              <div className={cn(
                'grid grid-cols-1 gap-4',
                form.type !== 'report_publisher' && 'sm:grid-cols-2'
              )}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-url">
                    사이트 URL{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Input
                    id="src-url"
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm(p => ({ ...p, url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                {form.type !== 'report_publisher' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-rss">
                    RSS URL{' '}
                    {needsRssUrl(form.type) ? (
                      <span className="text-[11px] text-negative">수집에 필요</span>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="src-rss"
                      type="url"
                      value={form.rss_url}
                      onChange={(e) => {
                        setForm(p => ({ ...p, rss_url: e.target.value }))
                        setFeedValidation(null)
                        setFeedValidationUrl('')
                      }}
                      placeholder="https://.../rss"
                      className={cn('min-w-0 flex-1', rssWarning && 'border-amber-400 focus-visible:ring-amber-200')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleValidateFeed}
                      disabled={isValidatingFeed || !form.rss_url.trim()}
                      className="shrink-0"
                    >
                      {isValidatingFeed ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          검증 중
                        </>
                      ) : (
                        '피드 검증'
                      )}
                    </Button>
                  </div>
                  {rssWarning && (
                    <p className="text-[11px] text-amber-600">
                      RSS URL이 없으면 자동 수집이 되지 않습니다.
                    </p>
                  )}
                  {feedValidation && feedValidationUrl === form.rss_url.trim() && (
                    <div className={cn(
                      'rounded-lg border px-3 py-2 text-xs leading-relaxed',
                      feedValidation.ok
                        ? 'border-positive/30 bg-positive-soft text-positive'
                        : 'border-destructive/30 bg-destructive/10 text-destructive'
                    )}>
                      <div className="flex items-center gap-1.5 font-medium">
                        {feedValidation.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}
                        {feedValidation.ok
                          ? `정상 · ${feedValidation.itemCount.toLocaleString()}건 · 최신 ${formatFeedDate(feedValidation.latestPublishedAt)}`
                          : feedErrorMessage(feedValidation)}
                      </div>
                      {feedValidation.ok && feedValidation.sampleTitles.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                          {feedValidation.sampleTitles.map((title) => (
                            <li key={title} className="truncate">
                              “{title}”
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* 수집 주기·활성 (report_publisher 는 주기 불필요) */}
              <div className={cn(
                'grid grid-cols-1 gap-4',
                form.type !== 'report_publisher' && 'sm:grid-cols-2'
              )}>
                {form.type !== 'report_publisher' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-interval">
                    수집 주기(분){' '}
                    <span className="text-xs font-normal text-muted-foreground">기본 720 = 12시간</span>
                  </Label>
                  <Input
                    id="src-interval"
                    type="number"
                    min={30}
                    value={form.crawl_interval_minutes}
                    onChange={(e) => setForm(p => ({ ...p, crawl_interval_minutes: e.target.value }))}
                    placeholder="720"
                  />
                </div>
                )}

                <div className="flex items-end pb-0.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                    />
                    <span className="text-sm text-foreground">활성화 (자동 수집 대상)</span>
                  </label>
                </div>
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
                    editingId ? '수정 저장' : '소스 추가'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 유형 탭 (§A) — 단일 선택 ── */}
      {!showForm && (
        <div className="flex items-center gap-0 overflow-x-auto border-b border-border">
          <button
            onClick={() => { setSelectedType('all'); table.setPage(1) }}
            className={cn(
              'whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
              selectedType === 'all'
                ? 'border-b-2 border-brand-600 text-brand-600'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            전체 <span className="ml-1 text-xs">({total})</span>
          </button>
          {SOURCE_TYPES.map(type => (
            <button
              key={type}
              onClick={() => { setSelectedType(type); table.setPage(1) }}
              className={cn(
                'whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
                selectedType === type
                  ? 'border-b-2 border-brand-600 text-brand-600'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {SOURCE_TYPE_LABELS[type]} <span className="ml-1 text-xs">({typeCounts[type]})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── 목록 헤더 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${total}개 소스${selectedType !== 'all' ? ` (${filteredTotal}개 표시)` : ''}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!showForm && (
            <>
              <AdminManualCrawl onComplete={loadSources} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImport(true)}
              >
                <FileUp className="mr-1.5 h-4 w-4" />
                대량 등록
              </Button>
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-1.5 h-4 w-4" />
                소스 추가
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── 목록 테이블 ── */}
      <AdminTable
        columns={columns}
        rows={sources}
        rowKey={(source) => source.id}
        minWidth="min-w-[700px]"
        state={tableState}
        emptyMessage={total === 0 ? '등록된 소스가 없습니다. 소스 추가 버튼으로 첫 번째 소스를 등록해보세요.' : '선택한 유형의 소스가 없습니다.'}
        errorMessage={fetchError ?? undefined}
        onRetry={loadSources}
        pagination={{ page: table.page, pageSize: PAGE_SIZE, total: filteredTotal }}
        onPageChange={table.setPage}
      />

      <SourceImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadSources}
      />
    </div>
  )
}
