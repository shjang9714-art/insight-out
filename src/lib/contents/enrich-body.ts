import 'server-only'
import { extract } from '@extractus/article-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { resolveArticleUrlDetailed } from '@/lib/crawler/resolve-url'
import { findRealUrlByTitle } from '@/lib/crawler/title-research'
import { copyExternalImageToCover } from '@/lib/contents/cover-from-image'
import { assessBodyQuality } from '@/lib/crawler/quality'
import { SUMMARY_MIN_BODY_LEN } from '@/lib/crawler/summarize'

const ENRICH_MIN_BODY_LEN = 400

// 441 — 본문 추출 실패 재시도 정책. 시도 n회차(0-base) 실패 후 다음 재시도까지 지연(분).
const MAX_BODY_RETRIES = 4
const RETRY_BACKOFF_MIN = [30, 180, 720, 1440]

// 282 — og:image 품질게이트(자동 수집 경로 전용)
const COVER_MIN_WIDTH = 200
const COVER_MIN_HEIGHT = 150

// 본문 계열 review_reason만 보강 후 재판정 대상 — low_relevance/llm_irrelevant/excluded_rule은 절대 건드리지 않음.
const BODY_REVIEW_REASONS = new Set(['body_short', 'body_missing', 'body_truncated', 'extract_failed'])

export interface EnrichBodyRow {
  id: string
  title: string
  original_url: string
  body_original: string | null
  thumbnail_url?: string | null
  status?: string | null
  review_reason?: string | null
  source_id?: string | null
  matched_groups?: string[] | null
  body_retry_count?: number | null
}

/**
 * 본문 개선 성공 시 업데이트 — retry 카운트 리셋 포함, 컬럼 미적용(42703) 시 폴백.
 */
export async function applyBodySuccessUpdate(
  admin: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
): Promise<void> {
  const withRetryReset = { ...update, body_retry_count: 0, body_next_retry_at: null }
  const { error } = await admin.from('contents').update(withRetryReset).eq('id', id)
  if (!error) return
  if (error.code !== '42703') {
    console.error('[본문보강] 업데이트 실패 (id:', id, '):', error.message)
    return
  }
  const { error: fallbackError } = await admin.from('contents').update(update).eq('id', id)
  if (fallbackError) console.error('[본문보강] 업데이트 실패 (id:', id, '):', fallbackError.message)
}

/**
 * 본문 추출 실패 시 — 재시도 상한 전이면 카운트+백오프로 다음 재시도 예약,
 * 상한 도달 시에만 body_fetched_at 으로 영구 종료. retry 컬럼 미적용(42703) 시
 * 기존 동작(즉시 영구 마킹)으로 graceful 폴백.
 */
export async function markBodyRetryOrGiveUp(
  admin: SupabaseClient,
  id: string,
  currentRetryCount: number,
): Promise<void> {
  const nextCount = currentRetryCount + 1
  if (nextCount < MAX_BODY_RETRIES) {
    const nextRetryAt = new Date(Date.now() + RETRY_BACKOFF_MIN[currentRetryCount] * 60_000).toISOString()
    const { error } = await admin
      .from('contents')
      .update({ body_retry_count: nextCount, body_next_retry_at: nextRetryAt })
      .eq('id', id)
    if (!error) return
    if (error.code !== '42703') {
      console.error('[본문보강] 재시도 업데이트 실패 (id:', id, '):', error.message)
      return
    }
    // 컬럼 미적용 — 아래로 흘러 기존(영구 마킹) 동작으로 폴백
  }
  const { error } = await admin
    .from('contents')
    .update({ body_fetched_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[본문보강] 영구 마킹 실패 (id:', id, '):', error.message)
}

interface RelevanceContext {
  keywordGroupCount: number
  sources: Map<string, { trust_tier: number; type: string }>
}

export interface DrainOptions {
  limit?: number
  from?: string | null
  to?: string | null
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
}

export interface DrainResult {
  processed: number
  improved: number
  skipped: number
  remaining: number
  decodeStats?: DecodeStats
}

export interface DecodeStats {
  attempted: number
  succeeded: number
  failed: number
  recovered: number
}

export interface EnrichByIdsResult {
  processed: number
  improved: number
  skipped: number
  truncated: boolean
}

const MAX_IDS_PER_CALL = 50

async function getRelevanceContext(
  admin: SupabaseClient,
  rows: EnrichBodyRow[],
  keywordGroupCount?: number,
): Promise<RelevanceContext> {
  const [groupResult, sourceResult] = await Promise.all([
    keywordGroupCount === undefined
      ? admin.from('keyword_groups').select('name', { count: 'exact', head: true }).eq('is_active', true)
      : Promise.resolve({ count: keywordGroupCount, data: null, error: null }),
    (async () => {
      const ids = [...new Set(rows.map(row => row.source_id).filter((id): id is string => Boolean(id)))]
      if (!ids.length) return { data: [], error: null }
      return admin.from('sources').select('id, trust_tier, type').in('id', ids)
    })(),
  ])
  const sources = new Map<string, { trust_tier: number; type: string }>()
  for (const source of sourceResult.data ?? []) sources.set(source.id, source)
  return { keywordGroupCount: groupResult.count ?? 0, sources }
}

/**
 * 단일 콘텐츠 행의 풀본문을 추출해 DB에 업데이트한다.
 * - improved: 풀본문 추출 성공 → body_original + body_fetched_at 업데이트
 * - marked:   추출 실패·스니펫이 더 길면 → body_fetched_at만 마킹(재시도 방지)
 * - error:    행 처리 중 예외(개발 경로; 호출부에서 집계만)
 */
export async function enrichOneBody(
  admin: SupabaseClient,
  row: EnrichBodyRow,
  relevance?: RelevanceContext,
  stats?: DecodeStats,
): Promise<'improved' | 'marked' | 'error'> {
  try {
    const resolution = await resolveArticleUrlDetailed(row.original_url)
    if (stats && resolution.isGoogleNews) {
      stats.attempted++
      if (resolution.resolved) stats.succeeded++
      else stats.failed++
    }
    let resolved = resolution.url
    if (resolution.isGoogleNews && !resolution.resolved && row.title) {
      const recoveredUrl = await findRealUrlByTitle(row.title)
      if (recoveredUrl) {
        resolved = recoveredUrl
        if (stats) stats.recovered++
      }
    }

    let extracted: string | null = null
    let ogImage: string | null = null
    try {
      const result = await extract(resolved, {}, { signal: AbortSignal.timeout(6000) })
      if (result?.content) {
        extracted = cleanBodyText(htmlToPlainText(result.content))
      }
      ogImage = result?.image ?? null
    } catch {
      // 추출 실패·타임아웃 — body_fetched_at 마킹만
    }

    if (!row.thumbnail_url && ogImage) {
      // 본문 fetch 에서 이미 받은 og:image 재사용(추가 네트워크 fetch 없음) — 282
      try {
        await copyExternalImageToCover(admin, row.id, ogImage, {
          minWidth: COVER_MIN_WIDTH,
          minHeight: COVER_MIN_HEIGHT,
        })
      } catch {
        // 실패해도 본문 처리는 계속 진행(생성 폴백 유지)
      }
    }

    const existingBody = cleanBodyText(htmlToPlainText(row.body_original ?? ''))
    const improved =
      extracted !== null &&
      extracted.length > existingBody.length &&
      extracted.length >= ENRICH_MIN_BODY_LEN

    if (improved && extracted) {
      const update: Record<string, unknown> = {
        body_original: extracted,
        body_fetched_at: new Date().toISOString(),
      }

      // 본문이 개선돼 품질 게이트를 통과하고, 갇힌 사유가 본문 계열이었을 때만 재판정해 발행.
      // 관련도 게이트(low_relevance/llm_irrelevant)·제외 규칙(excluded_rule)은 본문과 무관한
      // 판정이라 여기서 절대 건드리지 않는다 — BODY_REVIEW_REASONS 밖이면 review_reason 그대로 둠.
      if (
        row.review_reason &&
        BODY_REVIEW_REASONS.has(row.review_reason) &&
        assessBodyQuality(extracted, { minLen: SUMMARY_MIN_BODY_LEN }) === null
      ) {
        const source = row.source_id ? relevance?.sources.get(row.source_id) : undefined
        const relevancePass =
          (row.matched_groups?.length ?? 0) > 0 ||
          (relevance?.keywordGroupCount ?? 0) === 0 ||
          (source?.trust_tier ?? 0) >= 2 ||
          source?.type === 'web_insight'
        if (relevancePass) {
          update.status = 'published'
          update.review_reason = null
        } else {
          update.status = 'pending'
          update.review_reason = 'low_relevance'
        }
      }

      await applyBodySuccessUpdate(admin, row.id, update)
      return 'improved'
    }

    await markBodyRetryOrGiveUp(admin, row.id, row.body_retry_count ?? 0)
    return 'marked'
  } catch (e) {
    console.error('[본문보강] 아이템 오류 (id:', row.id, '):', e)
    return 'error'
  }
}

/**
 * 선택한 ID 목록의 풀본문을 채운다. body_fetched_at 조건 없이 강제 재시도.
 * ids > 50 이면 앞 50건만 처리하고 truncated=true 반환.
 */
export async function enrichByIds(
  admin: SupabaseClient,
  ids: string[],
  { deadline }: { deadline?: number } = {},
): Promise<EnrichByIdsResult> {
  const truncated = ids.length > MAX_IDS_PER_CALL
  const limitedIds = ids.slice(0, MAX_IDS_PER_CALL)

  const { data: targets } = await admin
    .from('contents')
    .select('id, title, original_url, body_original, thumbnail_url, status, review_reason, source_id, matched_groups, body_retry_count')
    .in('id', limitedIds)
    .not('original_url', 'is', null)

  let processed = 0, improved = 0, skipped = 0

  const rows = (targets ?? []) as EnrichBodyRow[]
  const relevance = await getRelevanceContext(admin, rows)
  for (const row of rows) {
    if (deadline !== undefined && Date.now() >= deadline) break
    const result = await enrichOneBody(admin, row, relevance)
    if (result === 'improved') improved++
    else skipped++
    processed++
  }

  return { processed, improved, skipped, truncated }
}

// 441 — body_next_retry_at 컬럼 존재 여부. 한 번 42703 확인되면 이후 게이트 쿼리 생략(불필요한 재시도 방지).
let retryGateSupported: boolean | null = null

function retryGateFilter(): string {
  return `body_next_retry_at.is.null,body_next_retry_at.lte.${new Date().toISOString()}`
}

export async function pendingCount(
  admin: SupabaseClient,
  from?: string | null,
  to?: string | null,
): Promise<number> {
  function buildQuery() {
    let q = admin
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .is('body_fetched_at', null)
      .not('original_url', 'is', null)
    if (from) q = q.gte('collected_at', from)
    if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z')
    return q
  }

  if (retryGateSupported !== false) {
    const gated = await buildQuery().or(retryGateFilter())
    if (!gated.error) {
      retryGateSupported = true
      return gated.count ?? 0
    }
    if (gated.error.code !== '42703') return gated.count ?? 0
    retryGateSupported = false
  }
  const { count } = await buildQuery()
  return count ?? 0
}

/**
 * 풀본문 백필 드레인.
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0까지 반복.
 */
export async function drainBackfill(
  admin: SupabaseClient,
  { limit = 30, from, to, deadline }: DrainOptions = {},
): Promise<DrainResult> {
  let processed = 0, improved = 0, skipped = 0, remaining = 0
  const decodeStats: DecodeStats = { attempted: 0, succeeded: 0, failed: 0, recovered: 0 }
  const { count: keywordGroupCount } = await admin
    .from('keyword_groups').select('name', { count: 'exact', head: true }).eq('is_active', true)

  function buildTargetQuery() {
    let q = admin
      .from('contents')
      .select('id, title, original_url, body_original, thumbnail_url, status, review_reason, source_id, matched_groups, body_retry_count')
      .is('body_fetched_at', null)
      .not('original_url', 'is', null)
    if (from) q = q.gte('collected_at', from)
    if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z')
    return q
  }

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    let targets: EnrichBodyRow[] | null = null
    let error: { code?: string } | null = null

    if (retryGateSupported !== false) {
      const gated = await buildTargetQuery().or(retryGateFilter()).order('collected_at', { ascending: false }).limit(limit)
      if (!gated.error) {
        retryGateSupported = true
        targets = gated.data as EnrichBodyRow[] | null
      } else if (gated.error.code !== '42703') {
        error = gated.error
      } else {
        retryGateSupported = false
      }
    }
    if (targets === null && error === null && retryGateSupported === false) {
      const ungated = await buildTargetQuery().order('collected_at', { ascending: false }).limit(limit)
      targets = ungated.data as EnrichBodyRow[] | null
      error = ungated.error
    }

    if (error || !targets?.length) {
      remaining = await pendingCount(admin, from, to)
      break
    }

    const rows = targets
    const relevance = await getRelevanceContext(admin, rows, keywordGroupCount ?? 0)
    for (const row of rows) {
      const result = await enrichOneBody(admin, row, relevance, decodeStats)
      if (result === 'improved') improved++
      else skipped++
    }
    processed += targets.length
    remaining = await pendingCount(admin, from, to)

    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, improved, skipped, remaining, decodeStats }
}
