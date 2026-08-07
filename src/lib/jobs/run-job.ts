import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface JobContext {
  /** 'cron:crawl' 형식. 289 참고. */
  key: string
  trigger: 'cron' | 'admin'
  mode?: string
  /** admin 실행자 id(cron이면 미지정 → null) */
  startedBy?: string
}

export interface RunJobOptions { rejectIfRunning?: boolean }

export class JobAlreadyRunningError extends Error {
  readonly startedAt: string
  constructor(startedAt: string) {
    super(`이미 실행 중입니다. (시작: ${new Date(startedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })})`)
    this.name = 'JobAlreadyRunningError'
    this.startedAt = startedAt
  }
}

interface CommonCounts {
  processed: number | null
  filled: number | null
  skipped_count: number | null
  remaining: number | null
}

/**
 * 결과 객체에서 공통 백필 카운트만 뽑는다(숫자일 때만). 없으면 null.
 * result.skipped 는 잡마다 숫자(건수)이거나 문자열(스킵 사유)이라 — 숫자일 때만 skipped_count로.
 */
function extractCommonCounts(result: unknown): CommonCounts {
  const counts: CommonCounts = { processed: null, filled: null, skipped_count: null, remaining: null }
  if (!result || typeof result !== 'object') return counts
  const r = result as Record<string, unknown>
  if (typeof r.processed === 'number') counts.processed = r.processed
  if (typeof r.filled === 'number') counts.filled = r.filled
  if (typeof r.skipped === 'number') counts.skipped_count = r.skipped
  if (typeof r.remaining === 'number') counts.remaining = r.remaining
  return counts
}

/**
 * result.skipped 가 truthy 이면서 "숫자가 아닐 때"만 status='skipped' 판정에 쓴다.
 * 숫자면 건수(예: 백필의 스킵된 행 수)이지 "이 잡 실행 자체가 스킵됐다"는 신호가 아니다.
 * (284 크론의 skipped:'not_scheduled' 같은 문자열/불리언만 스킵 신호로 취급.)
 */
function isSkippedStatus(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const skipped = (result as Record<string, unknown>).skipped
  if (typeof skipped === 'number') return false
  return Boolean(skipped)
}

/**
 * 예외 없이 결과 필드로만 실패를 알리는 잡(key-insights/daily-insights: result.failed===true)
 * 을 잡아낸다. r.ok===false 도 방어적으로 실패 취급(잡이 그렇게 반환하는 경우 대비 — 289 재현검증 수정).
 * skipped 판정보다 먼저 확인해 failed 가 우선하게 한다.
 */
function isFailedStatus(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  if (r.failed === true) return true
  if (r.ok === false) return true
  return false
}

/** result.error(문자열) → result.reason(문자열) → 기본 메시지 순으로 실패 사유를 뽑는다. */
function extractFailureReason(result: unknown): string {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (typeof r.error === 'string') return r.error
    if (typeof r.reason === 'string') return r.reason
  }
  return '결과가 failed로 보고됨'
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Vercel 함수가 maxDuration(모든 크론 중 최대 300초) 초과로 하드킬되면 try/finally 조차 못 돌고
// 프로세스가 죽는다 — job_runs 행이 status='running'으로 영영 남는다(2026-07-12부터 7건 실측:
// cron:body-backfill 2건, cron:signals-backfill 3건, cron:crawl 1건, 그 뒤로도 재발 가능).
// 하드킬은 JS 레벨에서 감지·복구가 원천적으로 불가능하므로, "다음에 도는 아무 크론"이 매번
// 스스로 청소하게 한다 — 별도 리퍼 크론/route 없이 자연 치유.
const STALE_RUN_THRESHOLD_MS = 15 * 60 * 1000 // 15분 (모든 maxDuration보다 충분히 여유)

async function reapStaleRunningJobs(admin: SupabaseClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString()
    const { data: staleRuns, error } = await admin
      .from('job_runs')
      .select('id, started_at')
      .eq('status', 'running')
      .lt('started_at', cutoff)

    if (error) {
      if (error.code !== '42P01') {
        console.error('[runJob] stale run 조회 실패:', error.message)
      }
      return
    }

    for (const run of (staleRuns ?? []) as { id: string; started_at: string }[]) {
      const startedAtMs = new Date(run.started_at).getTime()
      const { error: updateError } = await admin
        .from('job_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAtMs,
          error: `stale run reaped — ${STALE_RUN_THRESHOLD_MS / 60_000}분 넘게 running 상태로 남아 하드킬로 추정, 리퍼가 마감 처리함`,
        })
        .eq('id', run.id)
        .eq('status', 'running') // race 방지: 그 사이 다른 프로세스가 이미 마감했으면 건너뜀
      if (updateError) {
        console.error(`[runJob] stale run 마감 실패(id: ${run.id}):`, updateError.message)
      } else {
        console.warn(`[runJob] stale run 리핑됨(id: ${run.id}, started_at: ${run.started_at})`)
      }
    }
  } catch (e) {
    console.error('[runJob] stale run reap 오류:', toErrorMessage(e))
  }
}

/**
 * 공통 잡 계측 래퍼(289) — job_runs 에 시작/종료를 기록해 크론 실행을 눈에 보이게 만든다.
 *
 * ⚠️ 계측이 잡을 깨뜨리면 안 된다: job_runs insert/update 실패는 로깅만 하고 fn()의
 * 결과·예외를 그대로 전파한다. job_runs 테이블 미적용(42P01)에서도 잡은 정상 동작해야 한다.
 * insert 자체가 실패해 runId 를 못 얻으면 이후 update 는 조용히 건너뛴다.
 *
 * fn() 실행 구간은 try/finally 로 감싸 정상 반환·예외 두 경우 모두 반드시 종료 상태를
 * 기록한다. 단, Vercel 하드킬(maxDuration 초과 시 프로세스 강제종료)은 finally 도 못 돈다 —
 * 그 케이스는 reapStaleRunningJobs 가 다음 크론 실행 시점에 복구한다.
 */
export async function runJob<T>(
  admin: SupabaseClient,
  ctx: JobContext,
  fn: () => Promise<T>,
  opts: RunJobOptions = {},
): Promise<T> {
  await reapStaleRunningJobs(admin)

  if (opts.rejectIfRunning) {
    try {
      const { data, error } = await admin.from('job_runs').select('started_at').eq('job_key', ctx.key).eq('status', 'running').order('started_at', { ascending: true }).limit(1).maybeSingle()
      if (!error && data?.started_at) throw new JobAlreadyRunningError(data.started_at)
      if (error && error.code !== '42P01') console.error(`[runJob] 중복 실행 조회 실패(${ctx.key}):`, error.message)
    } catch (error) {
      if (error instanceof JobAlreadyRunningError) throw error
      console.error(`[runJob] 중복 실행 가드 오류(${ctx.key}):`, toErrorMessage(error))
    }
  }

  const startedAt = Date.now()
  let runId: string | null = null

  try {
    const { data, error } = await admin
      .from('job_runs')
      .insert({
        job_key: ctx.key,
        trigger: ctx.trigger,
        mode: ctx.mode ?? null,
        started_by: ctx.startedBy ?? null,
        status: 'running',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code !== '42P01') {
        console.error(`[runJob] job_runs insert 실패(${ctx.key}):`, error.message)
      }
    } else if (data) {
      runId = (data as { id: string }).id
    }
  } catch (e) {
    console.error(`[runJob] job_runs insert 오류(${ctx.key}):`, toErrorMessage(e))
  }

  // fn() 실행 구간을 감싸는 마감 로직 — 정상 반환/예외 두 경로 모두 finally 에서 반드시 거친다.
  // (result 는 try 성공 시에만 쓰이므로 catch 경로에서 굳이 채우지 않고 outcome 으로 분기)
  let outcome: { threw: true; err: unknown } | { threw: false; result: T } | null = null

  try {
    try {
      const result = await fn()
      outcome = { threw: false, result }
    } catch (err) {
      outcome = { threw: true, err }
    }
  } finally {
    if (runId && outcome) {
      try {
        if (outcome.threw) {
          await admin
            .from('job_runs')
            .update({
              status: 'failed',
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              error: toErrorMessage(outcome.err),
            })
            .eq('id', runId)
        } else {
          const { result } = outcome
          const counts = extractCommonCounts(result)
          // 우선순위: failed(예외 없이 result.failed===true/ok===false 로 알리는 잡) > skipped > succeeded
          const status = isFailedStatus(result) ? 'failed' : isSkippedStatus(result) ? 'skipped' : 'succeeded'
          await admin
            .from('job_runs')
            .update({
              status,
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              ...counts,
              ...(status === 'failed' ? { error: extractFailureReason(result) } : {}),
              meta: (result && typeof result === 'object') ? result : { value: result ?? null },
            })
            .eq('id', runId)
        }
      } catch (e) {
        console.error(`[runJob] job_runs update(마감) 실패(${ctx.key}):`, toErrorMessage(e))
      }
    }
  }

  if (outcome!.threw) throw outcome.err
  return outcome.result
}
