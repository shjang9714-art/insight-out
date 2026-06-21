import 'server-only'
import { extract } from '@extractus/article-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { resolveArticleUrl } from '@/lib/crawler/resolve-url'

const ENRICH_MIN_BODY_LEN = 400

export interface EnrichBodyRow {
  id: string
  original_url: string
  body_original: string | null
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
): Promise<'improved' | 'marked' | 'error'> {
  try {
    const resolved = await resolveArticleUrl(row.original_url)

    let extracted: string | null = null
    try {
      const result = await extract(resolved, {}, { signal: AbortSignal.timeout(6000) })
      if (result?.content) {
        extracted = cleanBodyText(htmlToPlainText(result.content))
      }
    } catch {
      // 추출 실패·타임아웃 — body_fetched_at 마킹만
    }

    const existingBody = cleanBodyText(htmlToPlainText(row.body_original ?? ''))
    const improved =
      extracted !== null &&
      extracted.length > existingBody.length &&
      extracted.length >= ENRICH_MIN_BODY_LEN

    if (improved && extracted) {
      await admin
        .from('contents')
        .update({ body_original: extracted, body_fetched_at: new Date().toISOString() })
        .eq('id', row.id)
      return 'improved'
    }

    await admin
      .from('contents')
      .update({ body_fetched_at: new Date().toISOString() })
      .eq('id', row.id)
    return 'marked'
  } catch (e) {
    console.error('[본문보강] 아이템 오류 (id:', row.id, '):', e)
    return 'error'
  }
}

async function pendingCount(
  admin: SupabaseClient,
  from?: string | null,
  to?: string | null,
): Promise<number> {
  let q = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .is('body_fetched_at', null)
    .not('original_url', 'is', null)
  if (from) q = q.gte('collected_at', from)
  if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z')
  const { count } = await q
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

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    let targetQ = admin
      .from('contents')
      .select('id, original_url, body_original')
      .is('body_fetched_at', null)
      .not('original_url', 'is', null)
    if (from) targetQ = targetQ.gte('collected_at', from)
    if (to)   targetQ = targetQ.lte('collected_at', to + 'T23:59:59.999Z')

    const { data: targets, error } = await targetQ
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (error || !targets?.length) {
      remaining = await pendingCount(admin, from, to)
      break
    }

    for (const row of targets as EnrichBodyRow[]) {
      const result = await enrichOneBody(admin, row)
      if (result === 'improved') improved++
      else skipped++
    }
    processed += targets.length
    remaining = await pendingCount(admin, from, to)

    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, improved, skipped, remaining }
}
