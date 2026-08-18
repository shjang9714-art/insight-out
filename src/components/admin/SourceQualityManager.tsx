'use client'

// 280 — /admin/sources 의 수집 상태·품질·크롤 실행 트리거를 이 화면으로 이동.
// 신규 API 없음 — /api/admin/source-status, /api/admin/source-quality, /api/admin/crawl-now,
// /api/admin/exclusion-rules(도메인 제외 원클릭) 그대로 재사용.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Ban, CheckCircle2, Loader2, RefreshCw, X, XCircle } from 'lucide-react'
import type { SourceType } from '@/lib/types'
import { SOURCE_TYPE_LABELS } from '@/lib/admin/source-types'
import {
  CRAWL_JOB_STORAGE_KEY,
  type CrawlJob,
  type CrawlProgress,
} from '@/lib/crawler/progress'
import type { RejectedBy } from '@/lib/crawler/types'
import { zeroRejectedBy } from '@/lib/crawler/types'
import type { SourceStatusInfo } from '@/app/api/admin/source-status/route'
import type { SourceQualityStat, SourceQualityResponse } from '@/app/api/admin/source-quality/route'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import { type Tone } from '@/lib/admin/status-style'

const QUALITY_DAYS_OPTIONS = [7, 14, 30] as const
type QualityDays = typeof QUALITY_DAYS_OPTIONS[number]

// 불량률(검토 대기율) 임계값 — 20% 미만 정상 · 20~40% 주의 · 40% 초과 저품질
function qualityTone(pendingRate: number): Tone {
  if (pendingRate > 0.4) return 'negative'
  if (pendingRate > 0.2) return 'risk'
  return 'positive'
}

// 312 — 제외 사유 한글 라벨 (orchestrator.ts 의 RejectedBy 키와 1:1)
const REJECT_REASON_LABEL: Record<keyof RejectedBy, string> = {
  ad:            '광고성',
  excludedGroup: '그룹제외',
  tooShort:      '길이미달',
  bodyTooShort:  '본문짧음',
  excludeRule:   '제외규칙',
}

function rejectedByTooltip(by: RejectedBy): string {
  const parts = (Object.keys(REJECT_REASON_LABEL) as (keyof RejectedBy)[])
    .filter((k) => by[k] > 0)
    .map((k) => `${REJECT_REASON_LABEL[k]} ${by[k]}`)
  return parts.join(' · ')
}

// 312 — 경고 피로 해소: "저활성"(정상, 필터가 거를 뿐)과 "고장"(사고)을 분리.
type HealthTier = 'broken' | 'low' | 'ok' | 'unknown'

const BROKEN_MAX_SUCCESS_AGE_DAYS = 3
const BROKEN_MIN_CONSECUTIVE_FAILURES = 3

function healthTier(isActive: boolean, status: SourceStatusInfo | undefined, nowMs: number): HealthTier {
  if (!status) return 'unknown'
  const lastSuccessAgeDays = status.lastSuccessAt
    ? (nowMs - new Date(status.lastSuccessAt).getTime()) / (24 * 60 * 60 * 1000)
    : Infinity
  if (status.consecutiveFailures >= BROKEN_MIN_CONSECUTIVE_FAILURES || lastSuccessAgeDays > BROKEN_MAX_SUCCESS_AGE_DAYS) {
    return 'broken'
  }
  if (isActive && status.inserted7d === 0) return 'low'
  return 'ok'
}

const HEALTH_TIER_ORDER: Record<HealthTier, number> = { broken: 0, low: 1, unknown: 2, ok: 3 }

/** 저활성 소스의 "왜 0건인지" 한 줄 요약(312 §3-5) — 클릭 없이 원인을 보여준다. */
function lowActivityReason(status: SourceStatusInfo | undefined): string | null {
  if (!status || status.fetched7d === 0) return status && status.fetched7d === 0 ? '가져온 원문 자체가 없음(피드가 비어 있을 수 있음)' : null
  const parts = [`가져옴 ${status.fetched7d}`]
  if (status.rejected7d > 0) {
    const reasonLabel = status.topRejectReason ? REJECT_REASON_LABEL[status.topRejectReason] : null
    parts.push(`제외 ${status.rejected7d}${reasonLabel ? `(${reasonLabel})` : ''}`)
  }
  if (status.duplicate7d > 0) parts.push(`중복 ${status.duplicate7d}`)
  return parts.join(' · ')
}

interface SourceLite {
  id: string
  name: string
  type: SourceType
  url: string | null
  rss_url: string | null
  is_active: boolean
  last_crawled_at: string | null
}

interface SourceDisplayRow {
  src: SourceLite
  status: SourceStatusInfo | undefined
  quality: SourceQualityStat | undefined
  tier: HealthTier
}

interface SourceCrawlState {
  status: 'running' | 'completed' | 'failed'
  message: string | null
}

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

export default function SourceQualityManager() {
  const confirm = useAdminConfirm()
  const supabase = createClient()

  const [sources,   setSources]   = useState<SourceLite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  // 수동 수집 기간 (0=오늘, 3/7/14/30=최근 N일 소급)
  const [crawlDays, setCrawlDays] = useState(0)

  // 소스별 수집 상태 (crawl_logs 7일 집계)
  const [sourceStatusMap, setSourceStatusMap] = useState<Map<string, SourceStatusInfo>>(new Map())
  // 312 — 고장 판정(마지막 성공 > 3일)에 쓰는 "지금". Date.now() 는 렌더 중 호출이 금지(순수성 규칙)돼
  // loadSourceStatus 가 데이터를 받아온 시점(일반 비동기 함수, effect 본문 아님)에 함께 기록한다.
  const [nowMs, setNowMs] = useState(0)

  // 소스별 수집 품질 (RPC source_quality_stats, 기간 선택)
  const [qualityDays, setQualityDays] = useState<QualityDays>(30)
  const [sourceQualityMap, setSourceQualityMap] = useState<Map<string, SourceQualityStat>>(new Map())
  // 312 — RPC 미적용(186 SQL 미실행) 등으로 품질 지표를 계산할 수 없을 때. '—' 대신 눈에 띄게 알린다.
  const [qualityUnavailable, setQualityUnavailable] = useState(false)

  // 저품질 소스 "도메인 제외" 원클릭
  const [excludingId, setExcludingId] = useState<string | null>(null)

  // 312 — 경고 피로 해소: 기본 정렬은 고장 먼저, 이름순 옵션 유지. "고장만 보기" 필터.
  const [sortMode, setSortMode] = useState<'health' | 'name'>('health')
  const [showBrokenOnly, setShowBrokenOnly] = useState(false)

  async function handleExcludeDomain(src: SourceLite) {
    const raw = src.rss_url || src.url
    if (!raw) return
    let domain = ''
    try {
      domain = new URL(raw).hostname.replace(/^www\./, '')
    } catch {
      setError('이 소스의 URL을 해석할 수 없어 도메인 제외 규칙을 만들 수 없습니다.')
      return
    }

    const confirmed = await confirm({ title: '도메인 제외 규칙 추가', description: '이후 이 도메인에서 수집되는 콘텐츠는 자동으로 검토 대기 처리됩니다(즉시 삭제 아님).', targets: [domain], confirmLabel: '추가' })
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
          note: `소스 "${src.name}" 저품질 → 소스 품질에서 원클릭 추가`,
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
      setNowMs(Date.now())
    } catch {
      // 비차단 — 상태 열만 '—' 표시
    }
  }

  // ── 소스 품질 로드 — RPC 미적용 시 '—' 대신 눈에 띄게 알림(312) ─────────────

  async function loadSourceQuality(days: QualityDays) {
    try {
      const res = await fetch(`/api/admin/source-quality?days=${days}`)
      if (!res.ok) return
      const data = await res.json() as SourceQualityResponse
      if ('unavailable' in data && data.unavailable) {
        setQualityUnavailable(true)
        setSourceQualityMap(new Map())
        return
      }
      setQualityUnavailable(false)
      setSourceQualityMap(new Map(Object.entries(data)))
    } catch {
      // 네트워크 오류 등 — 이건 비차단으로 둔다(재시도 여지 있음). RPC 미존재는 위에서 이미 명시적으로 처리.
    }
  }

  useEffect(() => {
    const run = async () => { await loadSourceQuality(qualityDays) }
    void run()
  }, [qualityDays])

  // ── 목록 로드 (경량 — 카탈로그 CRUD 없이 표시용 필드만) ──────────────────────

  async function loadSources() {
    const { data, error: err } = await supabase
      .from('sources')
      .select('id, name, type, url, rss_url, is_active, last_crawled_at')
      .order('order', { ascending: true })
      .order('name',  { ascending: true })
    if (err) {
      setError(`소스 목록 로드 실패: ${err.message}`)
    } else {
      setSources((data ?? []) as SourceLite[])
    }
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await loadSources()
      setIsLoading(false)
      await loadSourceStatus()
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 크롤링 트리거 ─────────────────────────────────────────────────────────

  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null)

  // 소스별 개별 수집 추적 (병렬 허용)
  const [sourceCrawlStates, setSourceCrawlStates] = useState<Record<string, SourceCrawlState>>({})
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
            rejected: 0,
            rejectedBy: zeroRejectedBy(),
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

  // 소스별 완료 감지 폴링 — 전체 수집과 동일하게 중복 요청을 막고 완료 시 정지한다.
  useEffect(() => {
    const runningIds = Object.entries(sourceCrawlStates)
      .filter(([, state]) => state.status === 'running')
      .map(([sourceId]) => sourceId)
    if (runningIds.length === 0) return

    let cancelled = false
    let isPolling = false

    const checkCompletion = async () => {
      if (isPolling) return
      isPolling = true

      try {
        const res = await fetch('/api/admin/source-status')
        const data: unknown = await res.json()
        if (!res.ok) {
          const message = (
            data
            && typeof data === 'object'
            && 'error' in data
            && typeof data.error === 'string'
          )
            ? data.error
            : '소스 수집 상태를 확인하지 못했습니다.'
          throw new Error(message)
        }
        if (cancelled) return

        const statusMap = data as Record<string, SourceStatusInfo>

        const now = new Date().getTime()
        const updates: Record<string, SourceCrawlState> = {}

        for (const sid of runningIds) {
          const startedAt = crawlStartedRef.current[sid] ?? 0
          const info = statusMap[sid]
          const finishedMs = info?.lastFinishedAt ? new Date(info.lastFinishedAt).getTime() : 0

          if (finishedMs > startedAt) {
            const failed = info.lastStatus === 'failed'
            updates[sid] = {
              status: failed ? 'failed' : 'completed',
              message: failed
                ? info.lastError ?? '이 소스 수집에 실패했습니다.'
                : null,
            }
          } else if (now - startedAt > 120_000) {
            updates[sid] = {
              status: 'failed',
              message: '수집 완료 여부를 확인하지 못했습니다. 크롤링 현황을 확인해주세요.',
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          setSourceCrawlStates((prev) => ({ ...prev, ...updates }))
          await loadSources()
          await loadSourceStatus()
        }
      } catch (pollError) {
        if (cancelled) return

        const now = new Date().getTime()
        const timedOutIds = runningIds.filter(
          (sourceId) => now - (crawlStartedRef.current[sourceId] ?? 0) > 120_000
        )
        if (timedOutIds.length > 0) {
          const message = pollError instanceof Error
            ? pollError.message
            : '소스 수집 상태를 확인하지 못했습니다.'
          setSourceCrawlStates((prev) => {
            const next = { ...prev }
            for (const sourceId of timedOutIds) {
              next[sourceId] = { status: 'failed', message }
            }
            return next
          })
        }
      } finally {
        isPolling = false
      }
    }

    void checkCompletion()
    const intervalId = window.setInterval(() => {
      void checkCompletion()
    }, 4_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [sourceCrawlStates]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCrawlNow = async () => {
    const rangeLabel = crawlDays === 0 ? '오늘 발행분을' : `최근 ${crawlDays}일치를`
    if (!(await confirm({ title: '소스 재수집', description: `모든 활성 소스의 ${rangeLabel} 지금 수집합니다.`, confirmLabel: '수집' }))) return

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

  const handleCrawlSource = async (source: SourceLite) => {
    if (!source.is_active) return

    crawlStartedRef.current[source.id] = new Date().getTime()
    setSourceCrawlStates((prev) => ({
      ...prev,
      [source.id]: { status: 'running', message: null },
    }))
    try {
      const res = await fetch('/api/admin/crawl-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const message = (
          data
          && typeof data === 'object'
          && 'error' in data
          && typeof data.error === 'string'
        )
          ? data.error
          : '수집 시작에 실패했습니다.'
        throw new Error(message)
      }
    } catch (startError) {
      setSourceCrawlStates((prev) => ({
        ...prev,
        [source.id]: {
          status: 'failed',
          message: startError instanceof Error
            ? startError.message
            : '수집 시작에 실패했습니다.',
        },
      }))
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

  // 312 — 경고 피로 해소: 상태 정렬·필터. 기본은 고장 먼저, 이름순 옵션도 남겨둔다.
  const sourceRows = sources.map((src) => {
    const status = sourceStatusMap.get(src.id)
    return { src, status, quality: sourceQualityMap.get(src.id), tier: healthTier(src.is_active, status, nowMs) }
  })
  const tierCounts = { broken: 0, low: 0, ok: 0, unknown: 0 }
  for (const row of sourceRows) tierCounts[row.tier]++

  const filteredRows = showBrokenOnly ? sourceRows.filter((r) => r.tier === 'broken') : sourceRows
  // Array.sort 는 안정 정렬(stable) — 동일 tier 내에서는 쿼리의 order/name 정렬이 그대로 유지된다.
  const displayRows = sortMode === 'health'
    ? [...filteredRows].sort((a, b) => HEALTH_TIER_ORDER[a.tier] - HEALTH_TIER_ORDER[b.tier])
    : filteredRows

  const sourceColumns: AdminTableColumn<SourceDisplayRow>[] = [
    { key: 'name', header: '이름', cell: ({ src }) => src.name, truncate: true },
    { key: 'type', header: '유형', cell: ({ src }) => <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[src.type]}</span> },
    { key: 'status', header: '수집 상태', nowrap: true, cell: ({ status: s, tier }) => { if (!s) return <span className="text-muted-foreground">—</span>; if (tier === 'broken') return <div><StatusBadge tone="negative" label={s.consecutiveFailures >= BROKEN_MIN_CONSECUTIVE_FAILURES ? `🔴 연속실패 ${s.consecutiveFailures}` : '🔴 마지막 성공 3일 초과'} />{s.lastError && <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-muted-foreground" title={s.lastError}>{s.lastError}</p>}</div>; if (tier === 'low') { const reason = lowActivityReason(s); return <div><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">⚠️ 저활성(7일 신규 0)</span>{reason && <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={reason}>{reason}</p>}</div> } return <span className="text-muted-foreground">✅ {s.inserted7d}건/7일</span> } },
    { key: 'quality', header: '수집 품질', nowrap: true, cell: ({ quality: q }) => { if (qualityUnavailable) return <span className="text-[11px] font-medium text-negative">품질 지표를 계산할 수 없습니다 (SQL 186 미적용)</span>; if (!q || q.total === 0) return <span className="text-muted-foreground/40">—</span>; const pendingPct=Math.round(q.pendingRate*100); const bodyFullPct=Math.round(q.bodyFullRate*100); return <div className="space-y-0.5"><div className="flex items-center gap-1.5"><span className="text-muted-foreground">{q.total.toLocaleString()}건</span><StatusBadge tone={qualityTone(q.pendingRate)} label={`불량 ${pendingPct}%`} /></div><p className="text-[11px] text-muted-foreground">본문확보 {bodyFullPct}%</p></div> } },
    { key: 'lastCrawled', header: '마지막 수집 (KST)', nowrap: true, cell: ({ src }) => formatKst(src.last_crawled_at) },
    { key: 'actions', header: '작업', align: 'right', cell: ({ src, quality: q }) => { const isLowQuality=Boolean(q && q.total>0 && qualityTone(q.pendingRate)!=='positive'); const sourceCrawlState=sourceCrawlStates[src.id]; const isCrawling=sourceCrawlState?.status==='running'; return <div className="flex flex-col items-end gap-1"><button type="button" onClick={()=>void handleCrawlSource(src)} disabled={!src.is_active||isCrawling} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40" aria-label={`${src.name} 소스만 수집`}>{isCrawling?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<RefreshCw className="h-3.5 w-3.5"/>}{isCrawling?'수집 중':'수집'}</button>{isLowQuality&&<button type="button" onClick={()=>void handleExcludeDomain(src)} disabled={excludingId===src.id} className="rounded p-1.5 text-risk disabled:opacity-40" title="이 소스 도메인을 제외 규칙(검토 대기)에 추가">{excludingId===src.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Ban className="h-3.5 w-3.5"/>}</button>}{sourceCrawlState?.status==='completed'&&<p className="text-[11px] text-positive">수집 완료</p>}{sourceCrawlState?.status==='failed'&&<p className="max-w-56 text-right text-[11px] text-negative">{sourceCrawlState.message ?? '수집에 실패했습니다.'}</p>}</div> } },
  ]

  return (
    <div className="space-y-6">
      {error && (
        <AdminErrorBox onDismiss={() => setError(null)}>
          {error}
        </AdminErrorBox>
      )}

      {/* ── 액션 바 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${sources.length}개 소스`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />시작 중...</>
            ) : (
              '지금 수집'
            )}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/crawl-settings?tab=exclusion-rules">제외 규칙 관리</Link>
          </Button>
        </div>
      </div>
      {crawlDays > 0 && (
        <p className="-mt-3 text-[11px] text-muted-foreground">
          RSS 특성상 피드에 남아있는 기사까지만 수집됩니다. 기간이 길면 시간이 걸릴 수 있습니다.
        </p>
      )}
      {qualityUnavailable && (
        <p className="-mt-3 text-[11px] font-medium text-negative">
          ⚠️ 품질 지표를 계산할 수 없습니다 — source_quality_stats RPC 미적용(SQL 186 미실행). 수희에게 핸드오프 요청 필요.
        </p>
      )}

      {/* ── 상태 요약 배너 + 정렬/필터(312) — 경고 60개가 진짜 경고 4개를 묻지 않게 ── */}
      {!isLoading && sources.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
          <p className="font-medium text-foreground">
            <span className="text-negative">🔴 고장 {tierCounts.broken}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-amber-700">⚠️ 저활성 {tierCounts.low}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-positive">✅ 정상 {tierCounts.ok}</span>
            {tierCounts.unknown > 0 && (
              <>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">미상 {tierCounts.unknown}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrokenOnly((v) => !v)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                showBrokenOnly
                  ? 'bg-negative text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              고장만 보기
            </button>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as 'health' | 'name')}>
              <SelectTrigger className="h-7 w-[110px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="health">상태순</SelectItem>
                <SelectItem value="name">이름순</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── 목록 테이블 ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          소스 목록 로드 중...
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          등록된 소스가 없습니다.
        </div>
      ) : displayRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          고장 상태인 소스가 없습니다.
        </div>
      ) : (
        <AdminTable
          columns={sourceColumns}
          rows={displayRows}
          rowKey={(row) => row.src.id}
          minWidth="min-w-[700px]"
          state={isLoading ? 'loading' : error ? 'error' : displayRows.length === 0 ? 'empty' : 'idle'}
          errorMessage={error ?? undefined}
          emptyMessage={sources.length === 0 ? '등록된 소스가 없습니다.' : '고장 상태인 소스가 없습니다.'}
        />
      )}

      {crawlJob && crawlProgress && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {crawlProgress.status === 'running' ? (
                <Loader2 className="size-5 animate-spin text-brand-600" />
              ) : crawlProgress.status === 'completed' ? (
                <CheckCircle2 className="size-5 text-positive" />
              ) : (
                <XCircle className="size-5 text-negative" />
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
                  ? 'bg-destructive'
                  : 'bg-brand-600'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
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
            {/* 보류·제외 — 312 이전엔 안 보이던 나머지 건수(가져옴 = 신규+중복+보류+제외) */}
            <div className="rounded-lg bg-muted px-2 py-2">
              <p className="text-[10px] text-muted-foreground">보류</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.held}
              </p>
            </div>
            <div
              className="rounded-lg bg-muted px-2 py-2"
              title={rejectedByTooltip(crawlProgress.rejectedBy) || undefined}
            >
              <p className="text-[10px] text-muted-foreground">제외</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.rejected}
              </p>
            </div>
            <div className="rounded-lg bg-negative-soft px-2 py-2">
              <p className="text-[10px] text-negative">실패</p>
              <p className="text-xs font-semibold text-negative">
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
            <p className="mt-3 text-xs leading-relaxed text-negative">
              {crawlProgress.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
