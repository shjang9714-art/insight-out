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

/**
 * 공통 잡 계측 래퍼(289) — job_runs 에 시작/종료를 기록해 크론 실행을 눈에 보이게 만든다.
 *
 * ⚠️ 계측이 잡을 깨뜨리면 안 된다: job_runs insert/update 실패는 로깅만 하고 fn()의
 * 결과·예외를 그대로 전파한다. job_runs 테이블 미적용(42P01)에서도 잡은 정상 동작해야 한다.
 * insert 자체가 실패해 runId 를 못 얻으면 이후 update 는 조용히 건너뛴다.
 */
export async function runJob<T>(
  admin: SupabaseClient,
  ctx: JobContext,
  fn: () => Promise<T>,
): Promise<T> {
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

  let result: T
  try {
    result = await fn()
  } catch (err) {
    if (runId) {
      try {
        await admin
          .from('job_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: toErrorMessage(err),
          })
          .eq('id', runId)
      } catch (e) {
        console.error(`[runJob] job_runs update(실패) 실패(${ctx.key}):`, toErrorMessage(e))
      }
    }
    throw err
  }

  if (runId) {
    try {
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
    } catch (e) {
      console.error(`[runJob] job_runs update(성공) 실패(${ctx.key}):`, toErrorMessage(e))
    }
  }

  return result
}
