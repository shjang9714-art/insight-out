'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CRAWL_JOB_STORAGE_KEY,
  type CrawlJob,
  type CrawlProgress,
} from '@/lib/crawler/progress'
import { cn } from '@/lib/utils'

const CRAWL_DAY_OPTIONS = [
  { value: 0, label: '오늘' },
  { value: 3, label: '최근 3일' },
  { value: 7, label: '최근 7일' },
  { value: 14, label: '최근 14일' },
  { value: 30, label: '최근 30일' },
] as const

type CrawlDays = (typeof CRAWL_DAY_OPTIONS)[number]['value']

interface AdminManualCrawlProps {
  onComplete?: () => void | Promise<void>
}

function isCrawlJob(value: unknown): value is CrawlJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Record<string, unknown>
  return (
    typeof job.jobId === 'string'
    && typeof job.startedAt === 'string'
    && !Number.isNaN(new Date(job.startedAt).getTime())
    && typeof job.sourcesTotal === 'number'
    && Number.isInteger(job.sourcesTotal)
    && job.sourcesTotal >= 0
    && job.sourcesTotal <= 500
  )
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (
    data
    && typeof data === 'object'
    && 'error' in data
    && typeof data.error === 'string'
  ) {
    return data.error
  }
  return fallback
}

export default function AdminManualCrawl({
  onComplete,
}: AdminManualCrawlProps) {
  const [crawlDays, setCrawlDays] = useState<CrawlDays>(0)
  const [isStarting, setIsStarting] = useState(false)
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const savedJob = window.localStorage.getItem(CRAWL_JOB_STORAGE_KEY)
    if (!savedJob) return

    let restoreTimer: number | null = null
    try {
      const parsedJob: unknown = JSON.parse(savedJob)
      if (!isCrawlJob(parsedJob)) {
        window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
        return
      }
      restoreTimer = window.setTimeout(() => setCrawlJob(parsedJob), 0)
    } catch {
      window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
    }

    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
    }
  }, [])

  useEffect(() => {
    if (!crawlJob) return

    let cancelled = false
    let finished = false
    let isPolling = false

    const pollProgress = async () => {
      if (finished || isPolling) return
      isPolling = true

      try {
        const params = new URLSearchParams({
          startedAt: crawlJob.startedAt,
          sourcesTotal: String(crawlJob.sourcesTotal),
        })
        const response = await fetch(`/api/admin/crawl-now?${params}`)
        const data: unknown = await response.json()
        if (!response.ok) {
          throw new Error(apiErrorMessage(data, '수집 진행 상태 조회에 실패했습니다.'))
        }
        if (cancelled) return

        const progress = data as CrawlProgress
        setCrawlProgress(progress)

        if (progress.status !== 'running') {
          finished = true
          window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
          try {
            await onComplete?.()
          } catch {
            setError('수집은 끝났지만 소스 목록을 새로고침하지 못했습니다.')
          }
        }
      } catch (pollError) {
        if (cancelled) return
        finished = true
        window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
        setError(
          pollError instanceof Error
            ? pollError.message
            : '수집 진행 상태를 확인하지 못했습니다.'
        )
        setCrawlJob(null)
      } finally {
        isPolling = false
      }
    }

    void pollProgress()
    const intervalId = window.setInterval(() => {
      void pollProgress()
    }, 4_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [crawlJob]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    const rangeLabel = crawlDays === 0 ? '오늘 발행분을' : `최근 ${crawlDays}일치를`
    if (!window.confirm(`모든 활성 소스의 ${rangeLabel} 지금 수집하시겠습니까?`)) return

    setIsStarting(true)
    setCrawlProgress(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/crawl-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillDays: crawlDays }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, '수집 요청에 실패했습니다.'))
      }
      if (!isCrawlJob(data)) {
        throw new Error('수집 작업 정보가 올바르지 않습니다.')
      }

      window.localStorage.setItem(CRAWL_JOB_STORAGE_KEY, JSON.stringify(data))
      setCrawlJob(data)
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : '수집 시작 중 오류가 발생했습니다.'
      )
    } finally {
      setIsStarting(false)
    }
  }

  const closeProgress = () => {
    if (crawlProgress?.status === 'running') return
    setCrawlProgress(null)
    setCrawlJob(null)
  }

  const progressPercent = crawlProgress?.sourcesTotal
    ? Math.min(
        100,
        Math.round((crawlProgress.completed / crawlProgress.sourcesTotal) * 100)
      )
    : crawlProgress?.status === 'completed'
      ? 100
      : 0
  const isCrawlActive = Boolean(
    crawlJob && (!crawlProgress || crawlProgress.status === 'running')
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          value={String(crawlDays)}
          onValueChange={(value) => setCrawlDays(Number(value) as CrawlDays)}
          disabled={isStarting || isCrawlActive}
        >
          <SelectTrigger
            className="h-8 w-[112px] text-xs"
            aria-label="수동 수집 기간"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRAWL_DAY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleStart}
          disabled={isStarting || isCrawlActive}
        >
          {isStarting || isCrawlActive ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-4" />
          )}
          {isStarting ? '시작 중...' : isCrawlActive ? '수집 중' : '지금 수집'}
        </Button>
        {error && (
          <p className="max-w-56 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {crawlJob && crawlProgress && (
        <aside
          className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
          aria-label="수동 수집 진행 현황"
        >
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
                onClick={closeProgress}
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

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
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
          </div>

          {crawlProgress.message && (
            <p
              className={cn(
                'mt-3 text-xs',
                crawlProgress.status === 'failed'
                  ? 'text-negative'
                  : 'text-muted-foreground'
              )}
            >
              {crawlProgress.message}
            </p>
          )}
        </aside>
      )}
    </>
  )
}
