import 'server-only'

import { extract } from '@extractus/article-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import {
  processCandidateItems,
  type CandidateProcessInput,
  type ProcessCrawlItemResult,
} from '@/lib/crawler/orchestrator'
import { resolveCanonical } from '@/lib/crawler/resolve-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertFetchableArticleUrl } from '@/lib/ingestion/fetch-safety'
import type { ArticleCandidateRow } from '@/lib/ingestion/types'

const MAX_ATTEMPTS = 4
const RETRY_DELAYS_MINUTES = [30, 180, 720]
const MIN_EXTRACTED_BODY_LENGTH = 100

type CandidateErrorCode =
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'PAYWALL'
  | 'BLOCKED'
  | 'EMPTY_CONTENT'
  | 'DUPLICATE'
  | 'INVALID_DATE'
  | 'TIMEOUT'
  | 'ROBOTS_DENIED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'QUALITY_REJECTED'

interface PreparedCandidate {
  row: ArticleCandidateRow
  input: CandidateProcessInput
  startedAt: number
}

export interface CandidateWorkerOptions {
  limit?: number
  deadline?: number
  leaseSeconds?: number
}

export interface CandidateWorkerSummary {
  ok: boolean
  claimed: number
  completed: number
  held: number
  duplicate: number
  rejected: number
  retryScheduled: number
  deadLetter: number
}

function classifyFetchError(error: unknown): CandidateErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('timeout') || message.includes('aborted')) return 'TIMEOUT'
  if (message.includes('403') || message.includes('차단')) return 'BLOCKED'
  if (message.includes('robots')) return 'ROBOTS_DENIED'
  if (message.includes('content-type')) return 'UNSUPPORTED_CONTENT_TYPE'
  return 'FETCH_FAILED'
}

async function writeAttempt(
  admin: SupabaseClient,
  candidateId: string,
  stage: string,
  result: 'success' | 'failed' | 'retry' | 'discarded',
  startedAt: number,
  errorCode?: CandidateErrorCode,
  errorDetail?: string,
): Promise<void> {
  const { error } = await admin.from('candidate_attempts').insert({
    candidate_id: candidateId,
    stage,
    result,
    error_code: errorCode ?? null,
    error_detail: errorDetail ?? null,
    duration_ms: Math.max(Date.now() - startedAt, 0),
    finished_at: new Date().toISOString(),
  })
  if (error) console.error(`[기사 후보] 시도 이력 저장 실패(${candidateId}):`, error.message)
}

async function scheduleRetry(
  admin: SupabaseClient,
  row: ArticleCandidateRow,
  code: CandidateErrorCode,
  detail: string,
  startedAt: number,
): Promise<'retry' | 'dead_letter'> {
  const exhausted = row.attempt_count >= MAX_ATTEMPTS
  const nextDelay = RETRY_DELAYS_MINUTES[Math.min(Math.max(row.attempt_count - 1, 0), RETRY_DELAYS_MINUTES.length - 1)]
  const update = exhausted
    ? {
        state: 'dead_letter',
        locked_until: null,
        last_error_code: code,
        last_error_detail: detail,
      }
    : {
        state: 'retry_wait',
        locked_until: null,
        next_retry_at: new Date(Date.now() + nextDelay * 60_000).toISOString(),
        last_error_code: code,
        last_error_detail: detail,
      }
  const { error } = await admin.from('article_candidates').update(update).eq('id', row.id)
  if (error) throw new Error(`기사 후보 재시도 상태 저장 실패: ${error.message}`)

  await writeAttempt(
    admin,
    row.id,
    row.stage,
    exhausted ? 'failed' : 'retry',
    startedAt,
    code,
    detail,
  )
  return exhausted ? 'dead_letter' : 'retry'
}

async function prepareCandidate(
  admin: SupabaseClient,
  row: ArticleCandidateRow,
): Promise<PreparedCandidate> {
  const startedAt = Date.now()
  await assertFetchableArticleUrl(row.original_url)
  const canonicalUrl = await resolveCanonical(row.original_url)
  await assertFetchableArticleUrl(canonicalUrl)

  const { data: canonicalMatches, error: canonicalMatchError } = await admin
    .from('article_candidates')
    .select('id, content_id')
    .eq('canonical_url', canonicalUrl)
    .neq('id', row.id)
    .order('discovered_at', { ascending: true })
    .limit(1)
  if (canonicalMatchError) {
    throw new Error(`Canonical 후보 조회 실패: ${canonicalMatchError.message}`)
  }
  const canonicalMatch = canonicalMatches?.[0] as { id: string; content_id: string | null } | undefined
  if (canonicalMatch) {
    const { error: discoveryMoveError } = await admin
      .from('candidate_discoveries')
      .update({ candidate_id: canonicalMatch.id })
      .eq('candidate_id', row.id)
    if (discoveryMoveError) {
      throw new Error(`기사 발견 출처 병합 실패: ${discoveryMoveError.message}`)
    }
    const { error: duplicateError } = await admin
      .from('article_candidates')
      .update({
        canonical_url: canonicalUrl,
        state: 'discarded',
        stage: 'validated',
        locked_until: null,
        content_id: canonicalMatch.content_id,
        last_error_code: 'DUPLICATE',
        last_error_detail: '동일 Canonical URL 후보에 발견 출처를 병합했습니다.',
      })
      .eq('id', row.id)
    if (duplicateError) {
      throw new Error(`중복 기사 후보 상태 저장 실패: ${duplicateError.message}`)
    }
    await writeAttempt(
      admin,
      row.id,
      'validated',
      'discarded',
      startedAt,
      'DUPLICATE',
      '동일 Canonical URL 후보에 발견 출처를 병합했습니다.',
    )
    const duplicate = new Error('동일 Canonical URL 후보입니다.')
    duplicate.name = 'CANONICAL_DUPLICATE'
    throw duplicate
  }

  const { error: resolveError } = await admin
    .from('article_candidates')
    .update({
      canonical_url: canonicalUrl,
      stage: 'url_resolved',
      last_error_code: null,
      last_error_detail: null,
    })
    .eq('id', row.id)
  if (resolveError) throw new Error(`원문 URL 상태 저장 실패: ${resolveError.message}`)

  const article = await extract(canonicalUrl, {}, {
    signal: AbortSignal.timeout(10_000),
  })
  const { error: fetchedError } = await admin
    .from('article_candidates')
    .update({ stage: 'content_fetched' })
    .eq('id', row.id)
  if (fetchedError) throw new Error(`본문 수집 상태 저장 실패: ${fetchedError.message}`)

  const body = article?.content
    ? cleanBodyText(htmlToPlainText(article.content))
    : ''
  if (body.length < MIN_EXTRACTED_BODY_LENGTH) {
    const error = new Error('추출된 본문이 최소 길이에 미달합니다.')
    error.name = 'EMPTY_CONTENT'
    throw error
  }

  const { error: fetchError } = await admin
    .from('article_candidates')
    .update({ stage: 'parsed' })
    .eq('id', row.id)
  if (fetchError) throw new Error(`본문 추출 상태 저장 실패: ${fetchError.message}`)

  await writeAttempt(admin, row.id, 'parsed', 'success', startedAt)
  return {
    row: { ...row, canonical_url: canonicalUrl, stage: 'parsed' },
    startedAt,
    input: {
      item: {
        original_url: canonicalUrl,
        title: article?.title?.trim() || row.title,
        body,
        author: article?.author?.trim() || row.author || undefined,
        published_at: row.published_at ?? undefined,
        thumbnail_url: article?.image || row.thumbnail_url || undefined,
        language: row.language,
      },
      source: {
        id: row.source_id,
        type: row.source_type,
        trust_tier: row.trust_tier,
        isSearchSourced: row.first_provider !== 'direct_rss' && row.first_provider !== 'direct_sitemap',
      },
    },
  }
}

async function finishCandidate(
  admin: SupabaseClient,
  prepared: PreparedCandidate,
  result: ProcessCrawlItemResult,
): Promise<CandidateErrorCode | null> {
  if (result.outcome === 'inserted' || result.outcome === 'held') {
    const { error } = await admin
      .from('article_candidates')
      .update({
        state: 'completed',
        stage: 'persisted',
        content_id: result.contentId ?? null,
        locked_until: null,
        last_error_code: null,
        last_error_detail: null,
      })
      .eq('id', prepared.row.id)
    if (error) throw new Error(`기사 후보 완료 상태 저장 실패: ${error.message}`)
    await writeAttempt(admin, prepared.row.id, 'persisted', 'success', prepared.startedAt)
    return null
  }

  if (result.outcome === 'duplicate' || result.outcome === 'rejected') {
    const code: CandidateErrorCode =
      result.outcome === 'duplicate' ? 'DUPLICATE' : 'QUALITY_REJECTED'
    const { error } = await admin
      .from('article_candidates')
      .update({
        state: 'discarded',
        stage: 'validated',
        locked_until: null,
        last_error_code: code,
        last_error_detail: result.errorMessage ?? null,
      })
      .eq('id', prepared.row.id)
    if (error) throw new Error(`기사 후보 제외 상태 저장 실패: ${error.message}`)
    await writeAttempt(
      admin,
      prepared.row.id,
      'validated',
      'discarded',
      prepared.startedAt,
      code,
      result.errorMessage,
    )
    return code
  }

  return 'PARSE_FAILED'
}

async function releaseUnstartedCandidate(
  admin: SupabaseClient,
  row: ArticleCandidateRow,
): Promise<void> {
  const { error } = await admin
    .from('article_candidates')
    .update({
      state: 'queued',
      locked_until: null,
      next_retry_at: new Date().toISOString(),
      attempt_count: Math.max(row.attempt_count - 1, 0),
    })
    .eq('id', row.id)
  if (error) throw new Error(`미처리 기사 후보 반환 실패: ${error.message}`)
}

export async function runCandidateWorker(
  options: CandidateWorkerOptions = {},
): Promise<CandidateWorkerSummary> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const leaseSeconds = Math.min(Math.max(options.leaseSeconds ?? 300, 30), 900)
  const { data, error } = await admin.rpc('claim_article_candidates', {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  })
  if (error) throw new Error(`기사 후보 점유 실패: ${error.message}`)

  const claimed = (data ?? []) as ArticleCandidateRow[]
  const prepared: PreparedCandidate[] = []
  let retryScheduled = 0
  let deadLetter = 0
  let canonicalDuplicate = 0

  for (const row of claimed) {
    if (options.deadline && Date.now() >= options.deadline) {
      await releaseUnstartedCandidate(admin, row)
      continue
    }

    try {
      prepared.push(await prepareCandidate(admin, row))
    } catch (error) {
      if (error instanceof Error && error.name === 'CANONICAL_DUPLICATE') {
        canonicalDuplicate++
        continue
      }
      const detail = error instanceof Error ? error.message : String(error)
      const code = error instanceof Error && error.name === 'EMPTY_CONTENT'
        ? 'EMPTY_CONTENT'
        : classifyFetchError(error)
      const result = await scheduleRetry(admin, row, code, detail, Date.now())
      if (result === 'retry') retryScheduled++
      else deadLetter++
    }
  }

  const processResults = await processCandidateItems(
    admin,
    prepared.map((candidate) => candidate.input),
  )
  let completed = 0
  let held = 0
  let duplicate = canonicalDuplicate
  let rejected = 0

  for (let index = 0; index < prepared.length; index++) {
    const candidate = prepared[index]
    const result = processResults[index]
    if (!result) continue

    const finishCode = await finishCandidate(admin, candidate, result)
    if (result.outcome === 'inserted') completed++
    else if (result.outcome === 'held') held++
    else if (finishCode === 'DUPLICATE') duplicate++
    else if (finishCode === 'QUALITY_REJECTED') rejected++
    else {
      const retryResult = await scheduleRetry(
        admin,
        candidate.row,
        'PARSE_FAILED',
        result.errorMessage ?? '콘텐츠 처리 단계에서 오류가 발생했습니다.',
        candidate.startedAt,
      )
      if (retryResult === 'retry') retryScheduled++
      else deadLetter++
    }
  }

  return {
    ok: true,
    claimed: claimed.length,
    completed,
    held,
    duplicate,
    rejected,
    retryScheduled,
    deadLetter,
  }
}
