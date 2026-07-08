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
import {
  Ban,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import type { SourceType, CollectionMethod } from '@/lib/types'
import { SOURCE_TYPE_LABELS } from '@/lib/admin/source-types'
import { SourceImportDialog } from '@/components/admin/SourceImportDialog'
import type {
  CrawlJob,
  CrawlProgress,
} from '@/lib/crawler/progress'
import type { SourceStatusInfo } from '@/app/api/admin/source-status/route'
import type { SourceQualityStat } from '@/app/api/admin/source-quality/route'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { REVIEW_REASON_LABEL, type Tone } from '@/lib/admin/status-style'

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

function defaultCollectionMethod(type: SourceType): CollectionMethod {
  if (type === 'youtube_channel') return 'youtube'
  if (type === 'report_publisher') return 'manual'
  return 'rss'
}
const CRAWL_JOB_STORAGE_KEY = 'insight-out:admin-crawl-job'

// 186: 소스 품질 기간 옵션
const QUALITY_DAYS_OPTIONS = [7, 14, 30] as const
type QualityDays = typeof QUALITY_DAYS_OPTIONS[number]

// 불량률(검토 대기율) 임계값 — 20% 미만 정상 · 20~40% 주의 · 40% 초과 저품질(175/180 톤, 그린 없음)
function qualityTone(pendingRate: number): Tone {
  if (pendingRate > 0.4) return 'negative'
  if (pendingRate > 0.2) return 'risk'
  return 'positive'
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

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function SourceManager() {
  const supabase = createClient()

  const [sources,   setSources]   = useState<SourceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)       // 초기값 true — useEffect 에서 setIsLoading(true) 호출 불필요
  const [error,     setError]     = useState<string | null>(null)

  // 추가/수정 폼 상태 (editingId=null → 추가, string → 수정)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<SourceForm>(FORM_INIT)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [isSaving,   setIsSaving]   = useState(false)
  const [showImport, setShowImport] = useState(false)

  // 수동 수집 기간 (0=오늘, 3/7/14/30=최근 N일 소급)
  const [crawlDays, setCrawlDays] = useState(0)

  // 유형 필터 상태 (§A) — 단일 탭
  const [selectedType, setSelectedType] = useState<SourceType | 'all'>('all')

  // 소스별 수집 상태 (crawl_logs 7일 집계)
  const [sourceStatusMap, setSourceStatusMap] = useState<Map<string, SourceStatusInfo>>(new Map())

  // 186: 소스별 수집 품질 (RPC source_quality_stats, 기간 선택)
  const [qualityDays, setQualityDays] = useState<QualityDays>(30)
  const [sourceQualityMap, setSourceQualityMap] = useState<Map<string, SourceQualityStat>>(new Map())

  // 190: 저품질 소스 "도메인 제외" 원클릭
  const [excludingId, setExcludingId] = useState<string | null>(null)

  async function handleExcludeDomain(src: SourceRow) {
    const raw = src.rss_url || src.url
    if (!raw) return
    let domain = ''
    try {
      domain = new URL(raw).hostname.replace(/^www\./, '')
    } catch {
      setError('이 소스의 URL을 해석할 수 없어 도메인 제외 규칙을 만들 수 없습니다.')
      return
    }

    const confirmed = window.confirm(
      `"${domain}" 도메인을 제외 규칙(검토 대기)에 추가하시겠습니까?\n\n` +
      `이후 이 도메인에서 수집되는 콘텐츠는 자동으로 검토 대기 처리됩니다(즉시 삭제 아님).`
    )
    if (!confirmed) return

    setExcludingId(src.id)
    try {
      const res = await fetch('/api/admin/exclusion-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: 'domain',
          value: domain,
          action: 'hold',
          note: `소스 "${src.name}" 저품질 → 소스 관리에서 원클릭 추가`,
          created_by: 'admin-ui',
        }),
      })
      const data = await res.json() as { item?: unknown; error?: string }
      if (!res.ok) {
        setError(data.error ?? '제외 규칙 생성에 실패했습니다.')
      }
    } catch {
      setError('제외 규칙 생성 중 오류가 발생했습니다.')
    } finally {
      setExcludingId(null)
    }
  }

  // ── 수집 상태 로드 ────────────────────────────────────────────────────────

  async function loadSourceStatus() {
    try {
      const res = await fetch('/api/admin/source-status')
      if (!res.ok) return
      const data = await res.json() as Record<string, SourceStatusInfo>
      setSourceStatusMap(new Map(Object.entries(data)))
    } catch {
      // 비차단 — 상태 열만 '—' 표시
    }
  }

  // ── 소스 품질 로드 (186) — RPC 미적용 시 graceful 빈 결과 ───────────────────

  async function loadSourceQuality(days: QualityDays) {
    try {
      const res = await fetch(`/api/admin/source-quality?days=${days}`)
      if (!res.ok) return
      const data = await res.json() as Record<string, SourceQualityStat>
      setSourceQualityMap(new Map(Object.entries(data)))
    } catch {
      // 비차단 — 품질 열만 숨김
    }
  }

  useEffect(() => {
    const run = async () => {
      await loadSourceQuality(qualityDays)
    }
    void run()
  }, [qualityDays])

  // ── 목록 로드 ─────────────────────────────────────────────────────────────

  async function loadSources() {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('sources')
      .select('id, name, type, url, rss_url, is_active, crawl_interval_minutes, collection_method, last_crawled_at, order')
      .order('order', { ascending: true })
      .order('name',  { ascending: true })
    if (err) {
      setError(`소스 목록 로드 실패: ${err.message}`)
    } else {
      setSources((data ?? []) as SourceRow[])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data, error: err } = await supabase
        .from('sources')
        .select('id, name, type, url, rss_url, is_active, crawl_interval_minutes, collection_method, last_crawled_at, order')
        .order('order', { ascending: true })
        .order('name',  { ascending: true })
      if (err) {
        setError(`소스 목록 로드 실패: ${err.message}`)
      } else {
        setSources((data ?? []) as SourceRow[])
      }
      setIsLoading(false)
      // 수집 상태 병렬 로드 (비차단 — init 내부에서 호출해 lint 규칙 준수)
      await loadSourceStatus()
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폼 열기/닫기 ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
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
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  // ── 폼 저장 ───────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('이름을 입력해주세요.')
      return
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

  // ── 삭제 ──────────────────────────────────────────────────────────────────

  const handleDelete = async (src: SourceRow) => {
    const confirmed = window.confirm(
      `"${src.name}"을(를) 삭제하시겠습니까?\n\n` +
      `⚠️ 단순 수집 중단이 목적이라면 비활성화를 권장합니다.\n` +
      `삭제해도 기존 콘텐츠·크롤링 로그는 보존됩니다.`
    )
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

  // 유형별 개수 계산
  const typeCounts = SOURCE_TYPES.reduce((acc, type) => {
    acc[type] = sources.filter(s => s.type === type).length
    return acc
  }, {} as Record<SourceType, number>)

  // 필터링된 소스 목록
  const filteredSources = selectedType === 'all'
    ? sources
    : sources.filter(s => s.type === selectedType)

  // collection_method 선택 옵션 — 기존 행에 html·api 있으면 편집 시 현행값 표시
  const availableCollectionMethods: CollectionMethod[] =
    form.collection_method === 'html' || form.collection_method === 'api'
      ? [form.collection_method, ...COLLECTION_METHODS]
      : COLLECTION_METHODS

  // ── 크롤링 트리거 (§B) ────────────────────────────────────────────────────

  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null)

  // 소스별 개별 수집 추적 (병렬 허용)
  const [crawlingIds, setCrawlingIds] = useState<Set<string>>(new Set())
  const crawlStartedRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const savedJob = window.localStorage.getItem(CRAWL_JOB_STORAGE_KEY)
    if (!savedJob) return

    let restoreTimer: number | null = null
    try {
      const parsedJob = JSON.parse(savedJob) as CrawlJob
      restoreTimer = window.setTimeout(() => setCrawlJob(parsedJob), 0)
    } catch {
      window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
    }

    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
    }
  }, [])

  useEffect(() => {
    if (!crawlJob || (
      crawlProgress
      && crawlProgress.status !== 'running'
    )) return

    let cancelled = false

    const pollProgress = async () => {
      try {
        const params = new URLSearchParams({
          startedAt: crawlJob.startedAt,
          sourcesTotal: String(crawlJob.sourcesTotal),
        })
        const response = await fetch(`/api/admin/crawl-now?${params}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error ?? '수집 진행 상태 조회 실패')
        }
        if (cancelled) return

        const progress = data as CrawlProgress
        setCrawlProgress(progress)

        if (progress.status !== 'running') {
          window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
          await loadSources()
        }
      } catch (pollError) {
        if (!cancelled) {
          setCrawlProgress({
            status: 'failed',
            startedAt: crawlJob.startedAt,
            sourcesTotal: crawlJob.sourcesTotal,
            completed: 0,
            success: 0,
            partial: 0,
            failed: 0,
            fetched: 0,
            inserted: 0,
            duplicates: 0,
            held: 0,
            latestSource: null,
            message: pollError instanceof Error
              ? pollError.message
              : '수집 진행 상태를 확인하지 못했습니다.',
          })
          window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
        }
      }
    }

    void pollProgress()
    const intervalId = window.setInterval(() => {
      if (crawlProgress?.status === 'running' || !crawlProgress) {
        void pollProgress()
      }
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [crawlJob, crawlProgress?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // 소스별 완료 감지 폴링 — crawlingIds 에 항목이 있을 때만 가동
  useEffect(() => {
    if (crawlingIds.size === 0) return

    const checkCompletion = async () => {
      try {
        const res = await fetch('/api/admin/source-status')
        if (!res.ok) return
        const statusMap = await res.json() as Record<string, { lastFinishedAt: string | null }>

        const now = Date.now()
        const toRemove: string[] = []

        for (const sid of crawlingIds) {
          const startedAt = crawlStartedRef.current[sid] ?? 0
          const info = statusMap[sid]
          const finishedMs = info?.lastFinishedAt ? new Date(info.lastFinishedAt).getTime() : 0

          if (finishedMs > startedAt) {
            toRemove.push(sid)
          } else if (now - startedAt > 120_000) {
            toRemove.push(sid)
          }
        }

        if (toRemove.length > 0) {
          setCrawlingIds(prev => {
            const n = new Set(prev)
            toRemove.forEach(id => n.delete(id))
            return n
          })
          await loadSourceStatus()
        }
      } catch {
        // 폴링 실패는 무시 — 120초 타임아웃으로 잠금 해제
      }
    }

    const intervalId = window.setInterval(() => void checkCompletion(), 4000)
    return () => window.clearInterval(intervalId)
  }, [crawlingIds]) // loadSourceStatus 는 컴포넌트 생명주기에 고정

  const handleCrawlNow = async () => {
    const rangeLabel = crawlDays === 0 ? '오늘 발행분을' : `최근 ${crawlDays}일치를`
    if (!window.confirm(`모든 활성 소스의 ${rangeLabel} 지금 수집하시겠습니까?`)) return

    setIsStartingCrawl(true)
    setCrawlProgress(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/crawl-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillDays: crawlDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '수집 요청 실패')

      const job = data as CrawlJob
      window.localStorage.setItem(CRAWL_JOB_STORAGE_KEY, JSON.stringify(job))
      setCrawlJob(job)
    } catch (err) {
      setError(err instanceof Error ? err.message : '수집 중 오류가 발생했습니다.')
    } finally {
      setIsStartingCrawl(false)
    }
  }

  const handleCrawlSource = async (sourceId: string) => {
    crawlStartedRef.current[sourceId] = Date.now()
    setCrawlingIds(prev => new Set(prev).add(sourceId))
    setError(null)
    try {
      const res = await fetch('/api/admin/crawl-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, backfillDays: crawlDays }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? '수집 시작 실패')
    } catch (e) {
      setCrawlingIds(prev => { const n = new Set(prev); n.delete(sourceId); return n })
      setError(e instanceof Error ? e.message : '수집 시작에 실패했습니다.')
    }
  }

  const closeCrawlProgress = () => {
    if (crawlProgress?.status === 'running') return
    setCrawlProgress(null)
    setCrawlJob(null)
  }

  const progressPercent = crawlProgress?.sourcesTotal
    ? Math.round(
        (crawlProgress.completed / crawlProgress.sourcesTotal) * 100
      )
    : crawlProgress?.status === 'completed'
      ? 100
      : 0

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 shrink-0 text-red-400 underline hover:text-red-600"
          >
            닫기
          </button>
        </div>
      )}

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
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              {/* 이름·유형 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-name">
                    이름 <span className="text-red-500">*</span>
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
                    유형 <span className="text-red-500">*</span>
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
                      <span className="text-[11px] text-red-500">수집에 필요</span>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                    )}
                  </Label>
                  <Input
                    id="src-rss"
                    type="url"
                    value={form.rss_url}
                    onChange={(e) => setForm(p => ({ ...p, rss_url: e.target.value }))}
                    placeholder="https://.../rss"
                    className={cn(rssWarning && 'border-amber-400 focus-visible:ring-amber-200')}
                  />
                  {rssWarning && (
                    <p className="text-[11px] text-amber-600">
                      RSS URL이 없으면 자동 수집이 되지 않습니다.
                    </p>
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
            onClick={() => setSelectedType('all')}
            className={cn(
              'whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
              selectedType === 'all'
                ? 'border-b-2 border-brand-600 text-brand-600'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            전체 <span className="ml-1 text-xs">({sources.length})</span>
          </button>
          {SOURCE_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${sources.length}개 소스${selectedType !== 'all' ? ` (${filteredSources.length}개 표시)` : ''}`}
        </p>
        <div className="flex items-center gap-2">
          {!showForm && (
            <>
              <Select
                value={String(qualityDays)}
                onValueChange={(v) => setQualityDays(Number(v) as QualityDays)}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_DAYS_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>품질 최근 {d}일</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={String(crawlDays)}
                    onValueChange={(v) => setCrawlDays(Number(v))}
                    disabled={isStartingCrawl || crawlProgress?.status === 'running'}
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">오늘</SelectItem>
                      <SelectItem value="3">최근 3일</SelectItem>
                      <SelectItem value="7">최근 7일</SelectItem>
                      <SelectItem value="14">최근 14일</SelectItem>
                      <SelectItem value="30">최근 30일</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCrawlNow}
                    disabled={isStartingCrawl || crawlProgress?.status === 'running'}
                  >
                    {isStartingCrawl ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        시작 중...
                      </>
                    ) : (
                      '지금 수집'
                    )}
                  </Button>
                </div>
                {crawlDays > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    RSS 특성상 피드에 남아있는 기사까지만 수집됩니다. 기간이 길면 시간이 걸릴 수 있습니다.
                  </p>
                )}
              </div>
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
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          소스 목록 로드 중...
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          등록된 소스가 없습니다. 소스 추가 버튼으로 첫 번째 소스를 등록해보세요.
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          선택한 유형의 소스가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">수집방법</th>
                <th className="px-4 py-3 max-w-[200px]">RSS URL</th>
                <th className="px-4 py-3">활성</th>
                <th className="px-4 py-3">주기(분)</th>
                <th className="px-4 py-3 whitespace-nowrap">수집 상태</th>
                <th className="px-4 py-3 whitespace-nowrap">수집 품질</th>
                <th className="px-4 py-3 whitespace-nowrap">마지막 수집 (KST)</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSources.map(src => {
                const q = sourceQualityMap.get(src.id)
                const isLowQuality = Boolean(q && q.total > 0 && qualityTone(q.pendingRate) !== 'positive')
                return (
                <tr key={src.id} className="hover:bg-accent/50 transition-colors">
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium text-foreground" title={src.name}>{src.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {SOURCE_TYPE_LABELS[src.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {COLLECTION_METHOD_LABELS[src.collection_method]}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {src.rss_url ? (
                      <span
                        className="block max-w-[180px] truncate text-xs text-muted-foreground"
                        title={src.rss_url}
                      >
                        {src.rss_url}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => handleToggle(src)}
                      className={cn(
                        'whitespace-nowrap text-xs font-medium transition-colors',
                        src.is_active
                          ? 'text-positive hover:opacity-80'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {src.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {src.crawl_interval_minutes ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(() => {
                      const s = sourceStatusMap.get(src.id)
                      if (!s) return <span className="text-muted-foreground">—</span>
                      if (s.consecutiveFailures >= 2) {
                        return (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              🔴 연속실패 {s.consecutiveFailures}
                            </span>
                            {s.lastError && (
                              <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-muted-foreground" title={s.lastError}>
                                {s.lastError}
                              </p>
                            )}
                          </div>
                        )
                      }
                      if (src.is_active && s.inserted7d === 0) {
                        return (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              ⚠️ 점검 필요
                            </span>
                            {s.lastError && (
                              <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-muted-foreground" title={s.lastError}>
                                {s.lastError}
                              </p>
                            )}
                          </div>
                        )
                      }
                      return (
                        <span className="text-muted-foreground">
                          ✅ {s.inserted7d}건/7일
                        </span>
                      )
                    })()}
                  </td>
                  <td className="admin-cell-wrap px-4 py-3 text-xs">
                    {(() => {
                      if (!q || q.total === 0) return <span className="text-muted-foreground/40">—</span>
                      const pendingPct = Math.round(q.pendingRate * 100)
                      const bodyFullPct = Math.round(q.bodyFullRate * 100)
                      const deadLinkPct = Math.round(q.deadLinkRate * 100)
                      const topReasonLabel = q.topReason ? REVIEW_REASON_LABEL[q.topReason] ?? q.topReason : '없음'
                      const tooltip =
                        `발행률 ${Math.round(q.publishRate * 100)}% · 본문확보율 ${bodyFullPct}% · ` +
                        `dead-link율 ${deadLinkPct}% · 대표 불량사유 ${topReasonLabel} · 북마크 ${q.bookmarks.toLocaleString()}건`
                      return (
                        <div className="space-y-0.5" title={tooltip}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{q.total.toLocaleString()}건</span>
                            <StatusBadge tone={qualityTone(q.pendingRate)} label={`불량 ${pendingPct}%`} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            본문확보 {bodyFullPct}%
                          </p>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {formatKst(src.last_crawled_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => handleCrawlSource(src.id)}
                        disabled={crawlingIds.has(src.id)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        title={crawlingIds.has(src.id) ? '수집 중...' : '이 소스만 수집'}
                      >
                        {crawlingIds.has(src.id)
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(src)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(src)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {isLowQuality && (
                        <button
                          onClick={() => void handleExcludeDomain(src)}
                          disabled={excludingId === src.id}
                          className="rounded p-1.5 text-risk transition-colors hover:bg-risk-soft disabled:cursor-not-allowed disabled:opacity-40"
                          title="이 소스 도메인을 제외 규칙(검토 대기)에 추가"
                        >
                          {excludingId === src.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Ban className="h-3.5 w-3.5" />
                          }
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <SourceImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadSources}
      />

      {crawlJob && crawlProgress && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {crawlProgress.status === 'running' ? (
                <Loader2 className="size-5 animate-spin text-brand-600" />
              ) : crawlProgress.status === 'completed' ? (
                <CheckCircle2 className="size-5 text-positive" />
              ) : (
                <XCircle className="size-5 text-red-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {crawlProgress.status === 'running'
                    ? '콘텐츠 수집 중'
                    : crawlProgress.status === 'completed'
                      ? '콘텐츠 수집 완료'
                      : '콘텐츠 수집 확인 필요'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {crawlProgress.completed}/{crawlProgress.sourcesTotal}개 소스 처리
                </p>
              </div>
            </div>
            {crawlProgress.status !== 'running' && (
              <button
                type="button"
                onClick={closeCrawlProgress}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="수집 현황 닫기"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                crawlProgress.status === 'failed'
                  ? 'bg-red-500'
                  : 'bg-brand-600'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg bg-muted px-2 py-2">
              <p className="text-[10px] text-muted-foreground">가져옴</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.fetched}
              </p>
            </div>
            <div className="rounded-lg bg-positive-soft px-2 py-2">
              <p className="text-[10px] text-positive">신규</p>
              <p className="text-xs font-semibold text-positive">
                {crawlProgress.inserted}
              </p>
            </div>
            <div className="rounded-lg bg-muted px-2 py-2">
              <p className="text-[10px] text-muted-foreground">중복</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.duplicates}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-2">
              <p className="text-[10px] text-red-600">실패</p>
              <p className="text-xs font-semibold text-red-700">
                {crawlProgress.failed}
              </p>
            </div>
          </div>

          {crawlProgress.status === 'running' && (
            <p className="mt-3 truncate text-xs text-muted-foreground">
              {crawlProgress.latestSource
                ? `최근 완료: ${crawlProgress.latestSource}`
                : '활성 소스 연결을 준비하고 있습니다.'}
            </p>
          )}
          {crawlProgress.message && (
            <p className="mt-3 text-xs leading-relaxed text-red-600">
              {crawlProgress.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
