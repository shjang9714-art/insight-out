import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractVideoId } from '@/lib/youtube'
import {
  fetchAndSaveYoutubeTranscript,
  translateExistingYoutubeTranscript,
  type TranslationAvailability,
} from '@/lib/crawler/youtube-transcript'

/** 배치 사이 최소 딜레이(ms) — 비공식 엔드포인트 rate limit 대비(265 §0). */
const BATCH_DELAY_MS = 500

export interface DrainOptions {
  limit?: number
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
  /**
   * fresh(기본): transcript_fetched_at IS NULL(아직 시도 안 함).
   * retry: transcript_fetched_at IS NOT NULL AND (transcript IS NULL OR transcript_ko IS NULL)
   *   — 자막 자체가 없던 행 + 자막은 있는데 번역만 실패/예산초과로 비어있는 행 둘 다 재대상(265 재현검증 수정).
   */
  mode?: 'fresh' | 'retry'
}

export interface DrainResult {
  processed: number
  fetched: number
  skipped: number
  remaining: number
  /** false = transcript_fetched_at 컬럼 미적용(42703) → 265 SQL 적용 필요 */
  ready: boolean
}

interface YoutubeContentRow {
  id: string
  original_url: string | null
  transcript: string | null
  transcript_lang: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function pendingCount(admin: SupabaseClient, mode: 'fresh' | 'retry'): Promise<number> {
  let q = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('category', '유튜브')
    .is('deleted_at', null)
  q = mode === 'retry'
    ? q.not('transcript_fetched_at', 'is', null).or('transcript.is.null,transcript_ko.is.null')
    : q.is('transcript_fetched_at', null)
  const { count } = await q
  return count ?? 0
}

/**
 * 단일 행 처리 — 자막이 이미 있으면(retry 대상 중 번역만 필요한 행) 유튜브를 다시 긁지 않고
 * 번역만 재시도한다(265 재현검증 수정, rate limit 방지). 자막이 없으면 기존처럼 전체 수집+번역.
 */
async function processRow(
  admin: SupabaseClient,
  row: YoutubeContentRow,
  availability: TranslationAvailability,
): Promise<'fetched' | 'skipped'> {
  if (row.transcript) {
    const outcome = await translateExistingYoutubeTranscript(
      admin, row.id, row.transcript, row.transcript_lang ?? 'en', availability,
    )
    return outcome === 'translated' ? 'fetched' : 'skipped'
  }

  const videoId = extractVideoId(row.original_url)
  if (!videoId) {
    // video_id 를 뽑을 수 없는 행 — 마킹만 하고 스킵(무한 재시도 방지)
    await admin
      .from('contents')
      .update({ transcript_fetched_at: new Date().toISOString() })
      .eq('id', row.id)
    return 'skipped'
  }
  const outcome = await fetchAndSaveYoutubeTranscript(admin, row.id, videoId, availability)
  return outcome === 'fetched' ? 'fetched' : 'skipped'
}

/**
 * 유튜브 자막 수집 드레인(265) — 282 drainThumbnailBackfill 구조 복제.
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0까지 반복(배치 사이 짧은 딜레이).
 * transcript_fetched_at 컬럼 미적용(42703) 시 ready:false 로 graceful degrade(무한 루프 금지).
 * 번역 예산이 이번 실행 중 소진되면(availability) 이후 행에서는 번역 호출 자체를 건너뛴다
 * (배치가 헛돌지 않도록 — 265 재현검증 수정).
 */
export async function drainYoutubeTranscriptBackfill(
  admin: SupabaseClient,
  { limit = 10, deadline, mode = 'fresh' }: DrainOptions = {},
): Promise<DrainResult> {
  let processed = 0, fetched = 0, skipped = 0, remaining = 0
  const availability: TranslationAvailability = { exhausted: false }

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    let targetQ = admin
      .from('contents')
      .select('id, original_url, transcript, transcript_lang')
      .eq('category', '유튜브')
      .is('deleted_at', null)
    targetQ = mode === 'retry'
      ? targetQ.not('transcript_fetched_at', 'is', null).or('transcript.is.null,transcript_ko.is.null')
      : targetQ.is('transcript_fetched_at', null)

    const { data: targets, error } = await targetQ
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === '42703') {
        return { processed: 0, fetched: 0, skipped: 0, remaining: 0, ready: false }
      }
      break
    }

    if (!targets?.length) {
      remaining = await pendingCount(admin, mode)
      break
    }

    // 순차 처리 — 비공식 엔드포인트 rate limit 대비, 대량 병렬 금지(265 §0).
    for (const row of targets as YoutubeContentRow[]) {
      const result = await processRow(admin, row, availability)
      if (result === 'fetched') fetched++
      else skipped++
    }
    processed += targets.length
    remaining = await pendingCount(admin, mode)

    if (remaining === 0) break
    if (deadline === undefined) break
    await sleep(BATCH_DELAY_MS)
  }

  return { processed, fetched, skipped, remaining, ready: true }
}
