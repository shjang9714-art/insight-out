import 'server-only'
import { extract } from '@extractus/article-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { copyExternalImageToCover } from '@/lib/contents/cover-from-image'

const THUMBNAIL_TARGET_CATEGORIES = ['뉴스', '웹인사이트']

/** 자동 og:image 수집 품질게이트 — 이 미만이면 생성 폴백 유지(썸네일 미설정) */
const MIN_WIDTH = 200
const MIN_HEIGHT = 150

export interface DrainOptions {
  limit?: number
  from?: string | null
  to?: string | null
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
  /** fresh(기본): thumbnail_url·thumbnail_fetched_at 둘 다 null. retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상. */
  mode?: 'fresh' | 'retry'
}

export interface DrainResult {
  processed: number
  filled: number
  skipped: number
  remaining: number
  /** false = thumbnail_fetched_at 컬럼 미적용(42703) → 219 SQL 적용 필요 */
  ready: boolean
}

interface ThumbnailRow {
  id: string
  original_url: string
}

export async function pendingCount(
  admin: SupabaseClient,
  mode: 'fresh' | 'retry',
  from?: string | null,
  to?: string | null,
): Promise<number> {
  let q = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .in('category', THUMBNAIL_TARGET_CATEGORIES)
    .is('thumbnail_url', null)
    .not('original_url', 'is', null)
    .is('deleted_at', null)
    .or(mode === 'retry' ? 'thumbnail_fetched_at.not.is.null' : 'thumbnail_fetched_at.is.null')
  if (from) q = q.gte('collected_at', from)
  if (to)   q = q.lte('collected_at', to + 'T23:59:59.999Z')
  const { count } = await q
  return count ?? 0
}

/**
 * 단일 콘텐츠 행의 og:image를 원문에서 재수집해 report-covers 로 복사한다.
 * 성공·실패 무관하게 thumbnail_fetched_at 을 기록해 무한 재시도를 막는다(219).
 */
async function retryOneThumbnail(
  admin: SupabaseClient,
  row: ThumbnailRow,
): Promise<'filled' | 'skipped'> {
  let imageUrl: string | null = null
  try {
    const art = await extract(row.original_url, {}, { signal: AbortSignal.timeout(8000) })
    imageUrl = art?.image ?? null
  } catch {
    // 추출 실패·타임아웃 — skip 처리(아래에서 마킹)
  }

  let filled = false
  if (imageUrl) {
    const publicUrl = await copyExternalImageToCover(admin, row.id, imageUrl, {
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
    })
    filled = publicUrl !== null
  }

  await admin
    .from('contents')
    .update({ thumbnail_fetched_at: new Date().toISOString() })
    .eq('id', row.id)

  return filled ? 'filled' : 'skipped'
}

/**
 * 썸네일(og:image) 재시도 드레인.
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0까지 반복.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 ready:false 로 graceful degrade(무한 루프 금지).
 */
export async function drainThumbnailBackfill(
  admin: SupabaseClient,
  { limit = 20, from, to, deadline, mode = 'fresh' }: DrainOptions = {},
): Promise<DrainResult> {
  let processed = 0, filled = 0, skipped = 0, remaining = 0

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    let targetQ = admin
      .from('contents')
      .select('id, original_url')
      .in('category', THUMBNAIL_TARGET_CATEGORIES)
      .is('thumbnail_url', null)
      .not('original_url', 'is', null)
      .is('deleted_at', null)
      .or(mode === 'retry' ? 'thumbnail_fetched_at.not.is.null' : 'thumbnail_fetched_at.is.null')
    if (from) targetQ = targetQ.gte('collected_at', from)
    if (to)   targetQ = targetQ.lte('collected_at', to + 'T23:59:59.999Z')

    const { data: targets, error } = await targetQ
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === '42703') {
        return { processed: 0, filled: 0, skipped: 0, remaining: 0, ready: false }
      }
      break
    }

    if (!targets?.length) {
      remaining = await pendingCount(admin, mode, from, to)
      break
    }

    for (const row of targets as ThumbnailRow[]) {
      const result = await retryOneThumbnail(admin, row)
      if (result === 'filled') filled++
      else skipped++
    }
    processed += targets.length
    remaining = await pendingCount(admin, mode, from, to)

    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, filled, skipped, remaining, ready: true }
}
