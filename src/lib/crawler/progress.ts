import type { RejectedBy } from './types'
import { zeroRejectedBy } from './types'

export const CRAWL_JOB_STORAGE_KEY = 'insight-out:admin-crawl-job'

export interface CrawlJob {
  jobId: string
  startedAt: string
  sourcesTotal: number
}

export interface CrawlProgressLog {
  status: 'success' | 'partial' | 'failed'
  fetched_count: number
  inserted_count: number
  duplicate_count: number
  held_count: number
  /** 312 — SQL(312-crawl_logs-rejected.sql) 미적용 로그는 undefined/null 일 수 있다. */
  rejected_count?: number | null
  rejected_by?: RejectedBy | null
  sources: { name: string } | null
}

export interface CrawlProgress {
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  sourcesTotal: number
  completed: number
  success: number
  partial: number
  failed: number
  fetched: number
  inserted: number
  duplicates: number
  held: number
  rejected: number
  rejectedBy: RejectedBy
  latestSource: string | null
  message: string | null
}

export function summarizeCrawlProgress(
  logs: CrawlProgressLog[],
  sourcesTotal: number,
  startedAt: string,
  nowMs = Date.now()
): CrawlProgress {
  const relevantLogs = sourcesTotal > 0 ? logs.slice(0, sourcesTotal) : []
  const completed = relevantLogs.length
  const failed = relevantLogs.filter((log) => log.status === 'failed').length
  const partial = relevantLogs.filter((log) => log.status === 'partial').length
  const elapsedMs = nowMs - new Date(startedAt).getTime()
  const timedOut = completed < sourcesTotal && elapsedMs > 75_000
  const status =
    timedOut
      ? 'failed'
      : completed >= sourcesTotal
        ? failed > 0
          ? 'failed'
          : 'completed'
        : 'running'

  let message: string | null = null
  if (timedOut) {
    message =
      '수집 실행 시간이 초과되었습니다. 크롤링 현황에서 상세 로그를 확인해주세요.'
  } else if (failed > 0) {
    message = `${failed}개 소스 수집에 실패했습니다. 크롤링 현황에서 상세 로그를 확인해주세요.`
  } else if (partial > 0 && completed >= sourcesTotal) {
    message = `${partial}개 소스가 일부 항목만 처리되었습니다.`
  }

  const rejectedBy = zeroRejectedBy()
  for (const log of relevantLogs) {
    const by = log.rejected_by
    if (!by) continue
    rejectedBy.ad += by.ad ?? 0
    rejectedBy.excludedGroup += by.excludedGroup ?? 0
    rejectedBy.tooShort += by.tooShort ?? 0
    rejectedBy.bodyTooShort += by.bodyTooShort ?? 0
    rejectedBy.excludeRule += by.excludeRule ?? 0
  }

  return {
    status,
    startedAt,
    sourcesTotal,
    completed,
    success: relevantLogs.filter((log) => log.status === 'success').length,
    partial,
    failed,
    fetched: relevantLogs.reduce((sum, log) => sum + log.fetched_count, 0),
    inserted: relevantLogs.reduce((sum, log) => sum + log.inserted_count, 0),
    duplicates: relevantLogs.reduce(
      (sum, log) => sum + log.duplicate_count,
      0
    ),
    held: relevantLogs.reduce((sum, log) => sum + log.held_count, 0),
    rejected: relevantLogs.reduce((sum, log) => sum + (log.rejected_count ?? 0), 0),
    rejectedBy,
    latestSource: relevantLogs[0]?.sources?.name ?? null,
    message,
  }
}
