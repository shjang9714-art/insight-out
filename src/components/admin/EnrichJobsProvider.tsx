'use client'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  buildEnrichRunId,
  getEnrichJob,
  normalizeEnrichResult,
  type EnrichJobKey,
  type EnrichJobRunId,
} from '@/lib/admin/enrich-jobs'

const STORAGE_KEY = 'insight-out:enrich-jobs'
const LOOP_DELAY_MS = 300

export interface EnrichJobParams {
  mode?: 'fresh' | 'retry'
  from?: string | null
  to?: string | null
}

export interface RunState {
  key: EnrichJobKey
  /** 377 — 이 실행의 고유 식별자. 전역 작업은 key와 동일, 항목작업은 `${key}::${itemId}`. */
  runId: EnrichJobRunId
  /** 377 — 항목(per-item) 작업의 대상 id(예: briefing id). 전역 작업은 undefined. */
  itemId?: string
  /** 377 — 독에 함께 표시할 사람이 읽을 항목 라벨(예: 브리핑 날짜). */
  itemLabel?: string
  status: 'running' | 'done' | 'stopped' | 'error' | 'interrupted'
  acc: { processed: number; succeeded: number; skipped: number }
  remaining: number | null
  startedAt: string
  message: string
  error?: string
  extra?: Record<string, number>
  params?: EnrichJobParams
}

interface EnrichJobsContextValue {
  runs: ReadonlyMap<EnrichJobRunId, RunState>
  startJob: (key: EnrichJobKey, params?: EnrichJobParams, itemId?: string, itemLabel?: string) => void
  stopJob: (runId: EnrichJobRunId) => void
  resumeJob: (runId: EnrichJobRunId) => void
  dismiss: (runId: EnrichJobRunId) => void
}

const EnrichJobsContext = createContext<EnrichJobsContextValue | null>(null)

function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<RunState>
  return (
    typeof run.key === 'string' &&
    ['running', 'done', 'stopped', 'error', 'interrupted'].includes(run.status ?? '') &&
    typeof run.startedAt === 'string' &&
    typeof run.message === 'string' &&
    !!run.acc &&
    typeof run.acc.processed === 'number' &&
    typeof run.acc.succeeded === 'number' &&
    typeof run.acc.skipped === 'number' &&
    (typeof run.remaining === 'number' || run.remaining === null)
  )
}

function restoreRuns(): Map<EnrichJobRunId, RunState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()

    const restored = new Map<EnrichJobRunId, RunState>()
    for (const value of parsed) {
      if (!isRunState(value)) continue
      try {
        getEnrichJob(value.key)
      } catch {
        continue
      }
      // 377 이전에 저장된 값엔 runId가 없다 — key로 백필(당시엔 전역 작업만 있었으므로 동일값).
      const withRunId: RunState = { ...value, runId: value.runId ?? buildEnrichRunId(value.key, value.itemId) }
      restored.set(withRunId.runId, withRunId.status === 'running'
        ? { ...withRunId, status: 'interrupted', message: '탭 종료 또는 새로고침으로 중단됨' }
        : withRunId)
    }
    return restored
  } catch {
    return new Map()
  }
}

function readErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const error = (json as Record<string, unknown>).error
    if (typeof error === 'string') return error
  }
  return fallback
}

function isRateLimited(json: unknown): boolean {
  return !!json && typeof json === 'object' && !Array.isArray(json)
    && (json as Record<string, unknown>).rateLimited === true
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function useEnrichJobs(): EnrichJobsContextValue {
  const context = useContext(EnrichJobsContext)
  if (!context) throw new Error('useEnrichJobs는 EnrichJobsProvider 내부에서만 사용할 수 있습니다.')
  return context
}

export default function EnrichJobsProvider({ children }: { children: React.ReactNode }) {
  const confirm = useAdminConfirm()
  const [runs, setRuns] = useState<Map<EnrichJobRunId, RunState>>(new Map())
  const [isRestored, setIsRestored] = useState(false)
  const stopKeysRef = useRef(new Set<EnrichJobRunId>())
  const runTokensRef = useRef(new Map<EnrichJobRunId, symbol>())
  const doneTimersRef = useRef(new Map<EnrichJobRunId, number>())

  useEffect(() => {
    startTransition(() => {
      const restored = restoreRuns()
      setRuns((current) => new Map([...restored, ...current]))
      setIsRestored(true)
    })
  }, [])

  useEffect(() => {
    if (!isRestored) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(runs.values())))
    } catch {
      // 저장 불가 시 현재 탭에서는 계속 실행하되 새로고침 복원만 생략한다.
    }
  }, [isRestored, runs])

  useEffect(() => () => {
    // 어드민 영역을 벗어나면 현재 요청까지만 허용하고 다음 배치는 시작하지 않는다.
    runTokensRef.current.clear()
    for (const timer of doneTimersRef.current.values()) window.clearTimeout(timer)
  }, [])

  const updateRun = (runId: EnrichJobRunId, update: (current: RunState) => RunState) => {
    setRuns((current) => {
      const run = current.get(runId)
      if (!run) return current
      const next = new Map(current)
      next.set(runId, update(run))
      return next
    })
  }

  const scheduleDismiss = (runId: EnrichJobRunId) => {
    const previous = doneTimersRef.current.get(runId)
    if (previous) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      setRuns((current) => {
        if (current.get(runId)?.status !== 'done') return current
        const next = new Map(current)
        next.delete(runId)
        return next
      })
      doneTimersRef.current.delete(runId)
    }, 5_000)
    doneTimersRef.current.set(runId, timer)
  }

  const executeJob = async (initial: RunState) => {
    const job = getEnrichJob(initial.key)
    const runId = initial.runId
    const token = Symbol(initial.startedAt)
    runTokensRef.current.set(runId, token)
    stopKeysRef.current.delete(runId)

    const isCurrent = () => runTokensRef.current.get(runId) === token
    let acc = { ...initial.acc }
    // 377 — 항목작업(endpoint에 {id})은 대상 itemId로 경로를 치환한다.
    const endpoint = initial.itemId ? job.endpoint.replace('{id}', encodeURIComponent(initial.itemId)) : job.endpoint

    try {
      while (true) {
        const searchParams = new URLSearchParams()
        if (job.limit !== undefined) searchParams.set('limit', String(job.limit))
        if (job.modes && initial.params?.mode) searchParams.set('mode', initial.params.mode)
        if (job.dateRange && initial.params?.from) searchParams.set('from', initial.params.from)
        if (job.dateRange && initial.params?.to) searchParams.set('to', initial.params.to)
        const url = searchParams.size > 0 ? `${endpoint}?${searchParams.toString()}` : endpoint
        const response = await fetch(url, {
          method: job.method,
          ...(job.kind === 'once' && job.method === 'POST'
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
            : {}),
        })
        const json: unknown = await response.json()

        if (!isCurrent()) return
        if (!response.ok) {
          const message = readErrorMessage(json, `${job.label} 작업에 실패했습니다.`)
          if (response.status === 503) {
            updateRun(runId, (current) => ({
              ...current,
              status: 'stopped',
              message: 'SQL 미적용 — 수희 핸드오프 필요',
              error: message,
            }))
            return
          }
          throw new Error(message)
        }

        const result = normalizeEnrichResult(initial.key, json)
        if (!result.ready) {
          updateRun(runId, (current) => ({
            ...current,
            status: 'stopped',
            remaining: result.remaining,
            message: 'SQL 미적용 — 수희 핸드오프 필요',
          }))
          return
        }

        acc = {
          processed: acc.processed + result.processed,
          succeeded: acc.succeeded + result.succeeded,
          skipped: acc.skipped + result.skipped,
        }
        updateRun(runId, (current) => ({
          ...current,
          acc,
          remaining: result.remaining,
          extra: result.extra,
          message: '실행 중',
        }))

        if (stopKeysRef.current.has(runId)) {
          updateRun(runId, (current) => ({ ...current, status: 'stopped', message: '사용자가 중단함' }))
          return
        }
        if (isRateLimited(json)) {
          updateRun(runId, (current) => ({
            ...current,
            status: 'stopped',
            message: 'LLM 한도 소진 — 내일 다시 시도해 주세요',
          }))
          return
        }
        if (job.kind === 'once' || result.remaining === 0) {
          updateRun(runId, (current) => ({ ...current, status: 'done', message: '완료' }))
          scheduleDismiss(runId)
          return
        }
        if (result.processed === 0) {
          updateRun(runId, (current) => ({
            ...current,
            status: 'stopped',
            message: '처리 건수가 0건이라 안전하게 중단됨',
          }))
          return
        }

        await delay(LOOP_DELAY_MS)
      }
    } catch (error) {
      if (!isCurrent()) return
      const message = error instanceof Error ? error.message : `${job.label} 작업 중 오류가 발생했습니다.`
      updateRun(runId, (current) => ({ ...current, status: 'error', message: '오류 발생', error: message }))
    }
  }

  const startJob = async (key: EnrichJobKey, params?: EnrichJobParams, itemId?: string, itemLabel?: string) => {
    const job = getEnrichJob(key)
    const runId = buildEnrichRunId(key, itemId)
    if (runs.get(runId)?.status === 'running') return
    if (job.confirm && !(await confirm({ title: '관리 작업 실행 확인', description: job.confirm, confirmLabel: '실행' }))) return

    const initial: RunState = {
      key,
      runId,
      status: 'running',
      acc: { processed: 0, succeeded: 0, skipped: 0 },
      remaining: null,
      startedAt: new Date().toISOString(),
      message: '실행 중',
      ...(itemId ? { itemId } : {}),
      ...(itemLabel ? { itemLabel } : {}),
      ...(params ? { params } : {}),
    }
    setRuns((current) => new Map(current).set(runId, initial))
    void executeJob(initial)
  }

  const stopJob = (runId: EnrichJobRunId) => {
    stopKeysRef.current.add(runId)
    updateRun(runId, (current) => ({ ...current, status: 'stopped', message: '사용자가 중단함' }))
  }

  const resumeJob = (runId: EnrichJobRunId) => {
    const previous = runs.get(runId)
    if (!previous || previous.status === 'running' || previous.status === 'done') return
    const resumed: RunState = {
      ...previous,
      status: 'running',
      startedAt: new Date().toISOString(),
      message: '실행 중',
      error: undefined,
    }
    setRuns((current) => new Map(current).set(runId, resumed))
    void executeJob(resumed)
  }

  const dismiss = (runId: EnrichJobRunId) => {
    if (runs.get(runId)?.status === 'running') return
    const timer = doneTimersRef.current.get(runId)
    if (timer) window.clearTimeout(timer)
    doneTimersRef.current.delete(runId)
    setRuns((current) => {
      const next = new Map(current)
      next.delete(runId)
      return next
    })
  }

  return (
    <EnrichJobsContext.Provider value={{ runs, startJob, stopJob, resumeJob, dismiss }}>
      {children}
    </EnrichJobsContext.Provider>
  )
}
