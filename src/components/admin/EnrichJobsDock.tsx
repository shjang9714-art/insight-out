'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Minus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getEnrichJob } from '@/lib/admin/enrich-jobs'
import { useEnrichJobs, type RunState } from '@/components/admin/EnrichJobsProvider'

function getProgress(run: RunState): number | undefined {
  if (run.remaining === null) return undefined
  const total = run.acc.processed + run.remaining
  if (total === 0) return run.status === 'done' ? 100 : 0
  return Math.min(100, Math.round((run.acc.processed / total) * 100))
}

function StatusIcon({ status }: { status: RunState['status'] }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-positive" />
  return <AlertTriangle className="h-4 w-4 text-warning" />
}

export default function EnrichJobsDock() {
  const { runs, stopJob, resumeJob, dismiss } = useEnrichJobs()
  const [isMinimized, setIsMinimized] = useState(false)
  const visibleRuns = Array.from(runs.values())

  if (visibleRuns.length === 0) return null

  const runningCount = visibleRuns.filter((run) => run.status === 'running').length

  if (isMinimized) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-50 flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-xl"
        onClick={() => setIsMinimized(false)}
        aria-label="보강 작업 진행 독 펼치기"
      >
        <Loader2 className={cn('h-4 w-4 text-brand-600', runningCount > 0 && 'animate-spin')} />
        {visibleRuns.length}
      </button>
    )
  }

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl" aria-label="보강 작업 진행 현황">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {runningCount > 0 ? `작업 ${runningCount}개 진행 중` : '보강 작업 현황'}
        </p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setIsMinimized(true)} aria-label="진행 독 접기">
          <Minus className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
        {visibleRuns.map((run) => {
          const job = getEnrichJob(run.key)
          const progress = getProgress(run)
          const canResume = run.status === 'interrupted' || run.status === 'stopped' || run.status === 'error'
          return (
            <div key={run.runId} className="space-y-2.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusIcon status={run.status} />
                  <p className="truncate text-sm font-medium text-foreground">
                    {job.label}{run.itemLabel && <span className="text-muted-foreground"> · {run.itemLabel}</span>}
                  </p>
                  {run.status !== 'running' && <span className="shrink-0 text-xs text-muted-foreground">{run.status === 'done' ? '완료' : '중단됨'}</span>}
                </div>
                {run.status !== 'running' && run.status !== 'done' && (
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => dismiss(run.runId)} aria-label={`${job.label} 기록 지우기`}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                누적 {run.acc.processed.toLocaleString()} · 성공 {run.acc.succeeded.toLocaleString()}
                {run.remaining !== null && ` · 남은 ${run.remaining.toLocaleString()}`}
              </p>
              <p className={cn('text-xs', run.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {run.error ?? run.message}
              </p>

              {progress === undefined ? (
                run.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              ) : (
                <Progress value={progress} aria-label={`${job.label} ${progress}% 진행`} />
              )}

              <div className="flex items-center gap-2">
                {run.status === 'running' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => stopJob(run.runId)}>중단</Button>
                )}
                {canResume && (
                  <Button type="button" size="sm" variant="outline" onClick={() => resumeJob(run.runId)}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />이어서 실행
                  </Button>
                )}
                {canResume && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(run.runId)}>지우기</Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
