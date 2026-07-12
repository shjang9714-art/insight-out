import 'server-only'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { summarizeKo, summarizeYoutubeKo, SUMMARY_MIN_BODY_LEN } from '@/lib/crawler/summarize'

export interface DrainSummaryOptions {
  limit?: number
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
}

export interface DrainSummaryResult {
  ok?: false
  error?: string
  processed: number
  filled: number
  failed: number
  /** body_len 미적용 등으로 후보 단계에서 걸러지지 않았지만 아직 요약할 수 없는 건수 */
  notReady: number
  /** job_runs 의 스킵 칸에 notReady 를 표시하기 위한 호환 필드 */
  skipped: number
  /** -1: summary_attempted_at 컬럼 미적용(SQL 295 미실행) */
  remaining: number
}

interface ContentRow {
  id: string
  category: string
  title: string
  author: string | null
  body_original: string | null
  body_translated_ko: string | null
  original_language: string
}

const SUMMARY_READY_OR = [
  'category.eq.유튜브',
  `and(original_language.eq.ko,body_len.gte.${SUMMARY_MIN_BODY_LEN})`,
  'and(original_language.neq.ko,body_translated_ko.not.is.null)',
].join(',')

const SUMMARY_ATTEMPTED_MISSING_ERROR = 'summary_attempted_at 컬럼이 없어 요약 백필을 진행할 수 없습니다. SQL 295 적용이 필요합니다.'

function isUndefinedColumn(error: PostgrestError | null): boolean {
  return error?.code === '42703'
}

async function runPendingSummaryCount(
  admin: SupabaseClient,
  useReadinessFilter: boolean,
): Promise<{ remaining: number; useReadinessFilter: boolean; error: PostgrestError | null }> {
  let query = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .is('summary_ko', null)
    .is('summary_attempted_at', null)
  if (useReadinessFilter) query = query.or(SUMMARY_READY_OR)

  const { count, error } = await query
  if (!error) return { remaining: count ?? 0, useReadinessFilter, error: null }

  if (useReadinessFilter && isUndefinedColumn(error)) {
    return runPendingSummaryCount(admin, false)
  }

  return {
    remaining: isUndefinedColumn(error) ? -1 : 0,
    useReadinessFilter,
    error,
  }
}

async function fetchSummaryTargets(
  admin: SupabaseClient,
  limit: number,
  useReadinessFilter: boolean,
): Promise<{ targets: ContentRow[] | null; useReadinessFilter: boolean; error: PostgrestError | null }> {
  let query = admin
    .from('contents')
    .select('id, category, title, author, body_original, body_translated_ko, original_language')
    .eq('status', 'published')
    .is('summary_ko', null)
    .is('summary_attempted_at', null)
    .order('collected_at', { ascending: false })
    .limit(limit)
  if (useReadinessFilter) query = query.or(SUMMARY_READY_OR)

  const { data, error } = await query
  if (!error) return { targets: (data ?? []) as ContentRow[], useReadinessFilter, error: null }

  if (useReadinessFilter && isUndefinedColumn(error)) {
    const retry = await fetchSummaryTargets(admin, limit, false)
    if (!retry.error) {
      console.warn('[요약백필] body_len 후보 조건을 사용할 수 없어 조회 조건을 완화했습니다.')
    }
    return retry
  }

  return { targets: null, useReadinessFilter, error }
}

/**
 * 콘텐츠 1건의 요약을 생성해 적재한다. LLM 을 실제 호출한 경우에만 summary_attempted_at 을
 * 마킹한다. 본문/번역이 준비되지 않아 호출하지 못한 건은 다음 본문 백필 뒤 다시 후보가 된다.
 */
async function summarizeOne(admin: SupabaseClient, row: ContentRow): Promise<'filled' | 'failed' | 'not_ready'> {
  let summary: string | null = null
  let llmCalled = false

  try {
    if (row.category === '유튜브') {
      llmCalled = true
      summary = await summarizeYoutubeKo(row.title, row.author)
    } else {
      const rawBodyKo = row.original_language === 'ko'
        ? row.body_original?.trim()
        : row.body_translated_ko?.trim()
      if (!rawBodyKo) return 'not_ready'
      if (row.original_language === 'ko' && rawBodyKo.length < SUMMARY_MIN_BODY_LEN) {
        return 'not_ready'
      }
      llmCalled = true
      summary = await summarizeKo(row.title, rawBodyKo)
    }
  } catch (e) {
    console.error('[요약백필] 요약 생성 오류 (id:', row.id, '):', e)
  }

  if (!llmCalled) return 'not_ready'

  const attemptedAt = new Date().toISOString()
  if (summary) {
    const { error } = await admin
      .from('contents')
      .update({ summary_ko: summary, summary_attempted_at: attemptedAt })
      .eq('id', row.id)
    if (error) {
      console.error('[요약백필] 적재 실패 (id:', row.id, '):', error.message)
      return 'failed'
    }
    return 'filled'
  }

  const { error } = await admin
    .from('contents')
    .update({ summary_attempted_at: attemptedAt })
    .eq('id', row.id)
  if (error) console.error('[요약백필] 시도 마킹 실패 (id:', row.id, '):', error.message)
  return 'failed'
}

function sql295MissingResult(
  processed: number,
  filled: number,
  failed: number,
  notReady: number,
): DrainSummaryResult {
  return {
    ok: false,
    error: SUMMARY_ATTEMPTED_MISSING_ERROR,
    processed,
    filled,
    failed,
    notReady,
    skipped: notReady,
    remaining: -1,
  }
}

/**
 * summary_ko IS NULL 인 published 콘텐츠를 드레인한다(크롤 크리티컬 패스에서 분리, 293).
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0 까지 반복 — 평상시 하루치를 전부 비운다.
 */
export async function drainSummaries(
  admin: SupabaseClient,
  opts: DrainSummaryOptions = {},
): Promise<DrainSummaryResult> {
  const { limit = 20, deadline } = opts
  let processed = 0
  let filled = 0
  let failed = 0
  let notReady = 0
  let remaining = 0
  let useReadinessFilter = true

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    const targetRes = await fetchSummaryTargets(admin, limit, useReadinessFilter)
    useReadinessFilter = targetRes.useReadinessFilter
    const { targets, error } = targetRes

    if (error) {
      // 컬럼 미존재 (SQL 295 핸드오프 미실행)
      if (isUndefinedColumn(error)) {
        return sql295MissingResult(processed, filled, failed, notReady)
      }
      console.error('[요약백필] 조회 오류:', error)
      break
    }

    if (!targets?.length) {
      const countRes = await runPendingSummaryCount(admin, useReadinessFilter)
      useReadinessFilter = countRes.useReadinessFilter
      if (countRes.remaining === -1) {
        return sql295MissingResult(processed, filled, failed, notReady)
      }
      if (countRes.error) console.error('[요약백필] 남은 건수 조회 오류:', countRes.error)
      remaining = countRes.remaining
      break
    }

    let durableProgress = 0
    for (const row of targets) {
      if (deadline !== undefined && Date.now() >= deadline) break
      const result = await summarizeOne(admin, row)
      if (result === 'filled') filled++
      if (result === 'failed') failed++
      if (result === 'not_ready') notReady++
      if (result !== 'not_ready') durableProgress++
      processed++
    }

    const countRes = await runPendingSummaryCount(admin, useReadinessFilter)
    useReadinessFilter = countRes.useReadinessFilter
    if (countRes.remaining === -1) {
      return sql295MissingResult(processed, filled, failed, notReady)
    }
    if (countRes.error) console.error('[요약백필] 남은 건수 조회 오류:', countRes.error)
    remaining = countRes.remaining
    if (remaining === 0) break
    if (deadline === undefined) break
    if (durableProgress === 0) break
  }

  return { processed, filled, failed, notReady, skipped: notReady, remaining }
}
