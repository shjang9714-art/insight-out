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
import type { CrawlJob, CrawlProgress } from '@/lib/crawler/progress'
import type { SourceStatusInfo } from '@/app/api/admin/source-status/route'
import type { SourceQualityStat } from '@/app/api/admin/source-quality/route'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { REVIEW_REASON_LABEL, type Tone } from '@/lib/admin/status-style'

const CRAWL_JOB_STORAGE_KEY = 'insight-out:admin-crawl-job'

const QUALITY_DAYS_OPTIONS = [7, 14, 30] as const
type QualityDays = typeof QUALITY_DAYS_OPTIONS[number]

// 불량률(검토 대기율) 임계값 — 20% 미만 정상 · 20~40% 주의 · 40% 초과 저품질
function qualityTone(pendingRate: number): Tone {
  if (pendingRate > 0.4) return 'negative'
  if (pendingRate > 0.2) return 'risk'
  return 'positive'
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
  const supabase = createClient()

  const [sources,   setSources]   = useState<SourceLite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  // 수동 수집 기간 (0=오늘, 3/7/14/30=최근 N일 소급)
  const [crawlDays, setCrawlDays] = useState(0)

  // 소스별 수집 상태 (crawl_logs 7일 집계)
  const [sourceStatusMap, setSourceStatusMap] = useState<Map<string, SourceStatusInfo>>(new Map())

  // 소스별 수집 품질 (RPC source_quality_stats, 기간 선택)
  const [qualityDays, setQualityDays] = useState<QualityDays>(30)
  const [sourceQualityMap, setSourceQualityMap] = useState<Map<string, SourceQualityStat>>(new Map())

  // 저품질 소스 "도메인 제외" 원클릭
  const [excludingId, setExcludingId] = useState<string | null>(null)

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
    } catch {
      // 비차단 — 상태 열만 '—' 표시
    }
  }

  // ── 소스 품질 로드 — RPC 미적용 시 graceful 빈 결과 ─────────────────────────

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

        const now = new Date().getTime()
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
    crawlStartedRef.current[sourceId] = new Date().getTime()
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
            <Link href="/admin/exclusion-rules">제외 규칙 관리</Link>
          </Button>
        </div>
      </div>
      {crawlDays > 0 && (
        <p className="-mt-3 text-[11px] text-muted-foreground">
          RSS 특성상 피드에 남아있는 기사까지만 수집됩니다. 기간이 길면 시간이 걸릴 수 있습니다.
        </p>
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
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3 whitespace-nowrap">수집 상태</th>
                <th className="px-4 py-3 whitespace-nowrap">수집 품질</th>
                <th className="px-4 py-3 whitespace-nowrap">마지막 수집 (KST)</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map(src => {
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
                  <td className="px-4 py-3 text-xs">
                    {(() => {
                      const s = sourceStatusMap.get(src.id)
                      if (!s) return <span className="text-muted-foreground">—</span>
                      if (s.consecutiveFailures >= 2) {
                        return (
                          <div>
                            <StatusBadge tone="negative" label={`🔴 연속실패 ${s.consecutiveFailures}`} />
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
