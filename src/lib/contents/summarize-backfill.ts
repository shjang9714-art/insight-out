import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { summarizeKo, summarizeYoutubeKo, SUMMARY_MIN_BODY_LEN } from '@/lib/crawler/summarize'

export interface DrainSummaryOptions {
  limit?: number
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
}

export interface DrainSummaryResult {
  processed: number
  filled: number
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

async function pendingSummaryCount(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .is('summary_ko', null)
    .is('summary_attempted_at', null)
  return count ?? 0
}

/**
 * 콘텐츠 1건의 요약을 생성해 적재한다. 성공/실패/스킵 무관하게 summary_attempted_at 을
 * 마킹해 재드레인을 막는다(body_fetched_at/signals_classified_at 과 동일 패턴).
 */
async function summarizeOne(admin: SupabaseClient, row: ContentRow): Promise<'filled' | 'skipped'> {
  let summary: string | null = null

  try {
    if (row.category === '유튜브') {
      summary = await summarizeYoutubeKo(row.title, row.author)
    } else {
      const bodyKo = row.original_language === 'ko'
        ? row.body_original
        : row.body_translated_ko
      if (bodyKo && bodyKo.length >= SUMMARY_MIN_BODY_LEN) {
        summary = await summarizeKo(row.title, bodyKo)
      }
    }
  } catch (e) {
    console.error('[요약백필] 요약 생성 오류 (id:', row.id, '):', e)
  }

  const attemptedAt = new Date().toISOString()
  if (summary) {
    const { error } = await admin
      .from('contents')
      .update({ summary_ko: summary, summary_attempted_at: attemptedAt })
      .eq('id', row.id)
    if (error) {
      console.error('[요약백필] 적재 실패 (id:', row.id, '):', error.message)
      return 'skipped'
    }
    return 'filled'
  }

  const { error } = await admin
    .from('contents')
    .update({ summary_attempted_at: attemptedAt })
    .eq('id', row.id)
  if (error) console.error('[요약백필] 시도 마킹 실패 (id:', row.id, '):', error.message)
  return 'skipped'
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
  let remaining = 0

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    const { data: targets, error } = await admin
      .from('contents')
      .select('id, category, title, author, body_original, body_translated_ko, original_language')
      .eq('status', 'published')
      .is('summary_ko', null)
      .is('summary_attempted_at', null)
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (error) {
      // 컬럼 미존재 (SQL 295 핸드오프 미실행)
      if ((error as { code?: string }).code === '42703') {
        return { processed, filled, remaining: -1 }
      }
      console.error('[요약백필] 조회 오류:', error)
      break
    }

    if (!targets?.length) {
      remaining = await pendingSummaryCount(admin)
      break
    }

    for (const row of targets as ContentRow[]) {
      if (deadline !== undefined && Date.now() >= deadline) break
      const result = await summarizeOne(admin, row)
      if (result === 'filled') filled++
      processed++
    }

    remaining = await pendingSummaryCount(admin)
    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, filled, remaining }
}
