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
  remaining: number
  /** true 면 LLM 한도 소진으로 드레인을 중단했다 — 내일 한도 리셋 후 재개(312). */
  rateLimited?: boolean
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

/**
 * 요약 백필 후보를 RPC 로 조회한다 — 클러스터 대표 1건만 대상(571).
 * 나머지 조건(status/summary_ko/summary_attempted_at/deleted_at/body 준비 여부)은
 * 전부 RPC 함수 안으로 들어갔다. RPC 부재(PGRST202, 선행 SQL 미적용) 시 error 를 반환한다.
 */
async function fetchSummaryTargets(
  admin: SupabaseClient,
  limit: number,
): Promise<{ targets: ContentRow[] | null; error: PostgrestError | null }> {
  const { data, error } = await admin.rpc('summary_backfill_targets', { p_limit: limit })
  if (error) return { targets: null, error }
  return { targets: (data ?? []) as ContentRow[], error: null }
}

/** 남은 후보 건수 — RPC 가 클러스터 대표 기준으로 정확히 센다(571). */
async function runPendingSummaryCount(
  admin: SupabaseClient,
): Promise<{ remaining: number; error: PostgrestError | null }> {
  const { data, error } = await admin.rpc('summary_backfill_remaining')
  if (error) return { remaining: 0, error }
  return { remaining: typeof data === 'number' ? data : 0, error: null }
}

/**
 * 콘텐츠 1건의 요약을 생성해 적재한다. LLM 을 실제 호출한 경우에만 summary_attempted_at 을
 * 마킹한다. 본문/번역이 준비되지 않아 호출하지 못한 건은 다음 본문 백필 뒤 다시 후보가 된다.
 * ⛔ 한도소진(rate_limited)은 마킹하지 않는다 — 영구 실패가 아니라 내일 리셋되는 일시 상태(312).
 */
async function summarizeOne(admin: SupabaseClient, row: ContentRow): Promise<'filled' | 'failed' | 'not_ready' | 'rate_limited'> {
  let summary: string | null = null
  let llmCalled = false
  let rateLimited = false

  try {
    if (row.category === '유튜브') {
      llmCalled = true
      const res = await summarizeYoutubeKo(row.title, row.author)
      summary = res.text
      rateLimited = res.rateLimited
    } else {
      const rawBodyKo = row.original_language === 'ko'
        ? row.body_original?.trim()
        : row.body_translated_ko?.trim()
      if (!rawBodyKo) return 'not_ready'
      if (row.original_language === 'ko' && rawBodyKo.length < SUMMARY_MIN_BODY_LEN) {
        return 'not_ready'
      }
      llmCalled = true
      const res = await summarizeKo(row.title, rawBodyKo)
      summary = res.text
      rateLimited = res.rateLimited
    }
  } catch (e) {
    console.error('[요약백필] 요약 생성 오류 (id:', row.id, '):', e)
  }

  if (rateLimited) return 'rate_limited'
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

/**
 * summary_ko IS NULL 인 published 콘텐츠를 드레인한다(크롤 크리티컬 패스에서 분리, 293).
 * 571 — 후보는 클러스터 대표 1건으로 RPC 가 이미 걸러 넘긴다.
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
  let rateLimited = false

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    const { targets, error } = await fetchSummaryTargets(admin, limit)

    if (error) {
      // RPC 부재(PGRST202, 선행 SQL 미적용) 등 — 조용히 0건 성공으로 보고하지 않는다.
      console.error('[요약백필] 조회 오류:', error)
      return { ok: false, error: error.message, processed, filled, failed, notReady, skipped: notReady, remaining }
    }

    if (!targets?.length) {
      const countRes = await runPendingSummaryCount(admin)
      if (countRes.error) {
        console.error('[요약백필] 남은 건수 조회 오류:', countRes.error)
        return { ok: false, error: countRes.error.message, processed, filled, failed, notReady, skipped: notReady, remaining }
      }
      remaining = countRes.remaining
      break
    }

    let durableProgress = 0
    for (const row of targets) {
      if (deadline !== undefined && Date.now() >= deadline) break
      const result = await summarizeOne(admin, row)
      // 한도소진 — 나머지도 전부 실패할 게 뻔하니 즉시 중단(전부 박제 방지, 312).
      if (result === 'rate_limited') {
        rateLimited = true
        break
      }
      if (result === 'filled') filled++
      if (result === 'failed') failed++
      if (result === 'not_ready') notReady++
      if (result !== 'not_ready') durableProgress++
      processed++
    }

    const countRes = await runPendingSummaryCount(admin)
    if (countRes.error) {
      console.error('[요약백필] 남은 건수 조회 오류:', countRes.error)
      return { ok: false, error: countRes.error.message, processed, filled, failed, notReady, skipped: notReady, remaining }
    }
    remaining = countRes.remaining
    if (rateLimited) break
    if (remaining === 0) break
    if (deadline === undefined) break
    if (durableProgress === 0) break
  }

  return { processed, filled, failed, notReady, skipped: notReady, remaining, rateLimited }
}
