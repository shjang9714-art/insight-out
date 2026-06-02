import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from './adapters'
import { normalizeUrl, titleHash, bodyHash } from './normalize'
import { findByTitleHash, findByBodyHash } from './dedup'
import type { CrawlCounts } from './types'
import type { Source } from '@/lib/types'

/** 소스별 크롤 결과 */
export interface SourceCrawlResult {
  source_id: string
  source_name: string
  status: 'success' | 'partial' | 'failed'
  counts: CrawlCounts
  error?: string
}

/** 전체 크롤 실행 요약 (라우트 응답 형태) */
export interface CrawlSummary {
  ok: boolean
  sources_total: number
  success: number
  failed: number
  inserted: number
  duplicates: number
  held: number
}

/**
 * KST 오늘 00:00 을 UTC ISO 문자열로 변환.
 * 서버는 UTC 기준이므로 KST +9h 를 역산.
 */
function getTodayStartKst(): string {
  const kstOffsetMs = 9 * 60 * 60 * 1000
  const nowUtc = Date.now()
  // UTC 기준 KST 날짜 계산
  const nowKst = new Date(nowUtc + kstOffsetMs)
  // KST 0시 (UTC 날짜 구성 후 -9h)
  const kstMidnightUtc = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate()
  ) - kstOffsetMs
  return new Date(kstMidnightUtc).toISOString()
}

/**
 * N일 전 KST 0시를 UTC ISO 로 반환 (최초 구축·소급 수집용).
 * PRD 4.2: 최초/신규 소스는 admin 이 최대 30일 소급 지정 가능.
 */
function getDaysAgoStartKst(days: number): string {
  const todayStartMs = new Date(getTodayStartKst()).getTime()
  return new Date(todayStartMs - days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * 지수 백오프 재시도.
 * @param fn 실행할 비동기 함수
 * @param maxAttempts 최대 시도 횟수
 * @param delaysMs 시도 간 대기 시간(ms) 배열
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delaysMs: number[]
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < delaysMs.length) {
        await new Promise<void>(resolve => setTimeout(resolve, delaysMs[attempt]))
      }
    }
  }
  throw lastError
}

/** crawl_logs 테이블에 수집 결과 기록 */
async function writeCrawlLog(
  admin: SupabaseClient,
  sourceId: string,
  status: 'success' | 'partial' | 'failed',
  counts: CrawlCounts,
  startedAt: string,
  finishedAt: string,
  errorMessage?: string
): Promise<void> {
  const { error } = await admin.from('crawl_logs').insert({
    source_id: sourceId,
    status,
    fetched_count: counts.fetched,
    inserted_count: counts.inserted,
    duplicate_count: counts.duplicate,
    held_count: counts.held,
    error_message: errorMessage ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
  })
  if (error) {
    console.error('[크롤러] crawl_logs 기록 오류:', error.message)
  }
}

/** 소스 1개 크롤링 실행 */
async function crawlOne(
  admin: SupabaseClient,
  source: Source,
  since: string
): Promise<SourceCrawlResult> {
  const startedAt = new Date().toISOString()
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0 }
  let crawlStatus: 'success' | 'partial' | 'failed' = 'success'
  let errorMessage: string | undefined

  // 어댑터 없으면 skip (크래시 X)
  const adapter = getAdapter(source.type)
  if (!adapter) {
    console.log(`[크롤러] 소스 "${source.name}" (${source.type}): 어댑터 미구현, 건너뜀`)
    const finishedAt = new Date().toISOString()
    await writeCrawlLog(admin, source.id, 'success', counts, startedAt, finishedAt)
    return { source_id: source.id, source_name: source.name, status: 'success', counts }
  }

  try {
    // 3회 지수 백오프 재시도 (0.5s · 1s · 2s)
    const rawItems = await withRetry(
      () => adapter.fetch(source, since),
      3,
      [500, 1000, 2000]
    )
    counts.fetched = rawItems.length

    for (const item of rawItems) {
      try {
        const url = normalizeUrl(item.original_url)
        const tHash = titleHash(item.title)
        const bHash = bodyHash(item.body)

        // 2단계: 본문 해시 완전일치 중복 확인
        if (await findByBodyHash(admin, bHash)) {
          counts.duplicate++
          continue
        }
        // 3단계: 제목 해시 완전일치 중복 확인
        if (await findByTitleHash(admin, tHash)) {
          counts.duplicate++
          continue
        }

        // 콘텐츠 행 구성
        // - status·cluster_id·view_count·bookmark_count·is_editor_pick 은 payload 제외 → DB 기본값·기존값 보존
        // - is_published 컬럼 없음 (status enum 사용)
        const row = {
          category: '뉴스' as const,
          source_id: source.id,
          title: item.title,
          body_original: item.body ?? null,
          original_url: url,
          original_language: item.language ?? 'ko',
          author: item.author ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
          title_hash: tHash,
          body_hash: bHash,
          published_at: item.published_at ?? null,
          collected_at: new Date().toISOString(),
        }

        // 멱등 upsert: URL 충돌 시 메타데이터만 갱신 (사용자 파생 컬럼 보존)
        const { error: upsertError } = await admin
          .from('contents')
          .upsert(row, {
            onConflict: 'original_url',
            ignoreDuplicates: false,
          })

        if (upsertError) {
          console.error(`[크롤러] upsert 오류 (${url}):`, upsertError.message)
          crawlStatus = 'partial'
        } else {
          counts.inserted++
        }
      } catch (itemErr) {
        // 개별 아이템 오류는 partial 처리 후 계속
        console.error('[크롤러] 아이템 처리 오류:', itemErr)
        crawlStatus = 'partial'
      }
    }

    // 성공·부분성공 시 last_crawled_at 갱신
    await admin
      .from('sources')
      .update({ last_crawled_at: new Date().toISOString() })
      .eq('id', source.id)
  } catch (err) {
    crawlStatus = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[크롤러] 소스 "${source.name}" 수집 실패:`, errorMessage)
  }

  const finishedAt = new Date().toISOString()
  await writeCrawlLog(admin, source.id, crawlStatus, counts, startedAt, finishedAt, errorMessage)

  return {
    source_id: source.id,
    source_name: source.name,
    status: crawlStatus,
    counts,
    error: errorMessage,
  }
}

/** 전체 크롤 실행 — Orchestrator 진입점
 *  @param options.backfillDays 소급 수집 일수(1~30). 미지정/0 이면 당일(KST 0시 이후)만. */
export async function runCrawl(options?: { backfillDays?: number }): Promise<CrawlSummary> {
  const admin = createAdminClient()
  const backfillDays =
    options?.backfillDays && options.backfillDays > 0
      ? Math.min(Math.floor(options.backfillDays), 30)
      : 0
  const since = backfillDays > 0 ? getDaysAgoStartKst(backfillDays) : getTodayStartKst()

  // 활성 + crawl_interval_minutes 가 설정된 소스 조회
  const { data: rawSources, error: sourcesError } = await admin
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .not('crawl_interval_minutes', 'is', null)

  if (sourcesError) {
    throw new Error(`소스 조회 오류: ${sourcesError.message}`)
  }

  const allSources = (rawSources ?? []) as Source[]

  // 소급(backfill) 호출은 강제 전체 재수집: due-체크를 건너뛰고 활성 소스 전부 실행.
  // (수동 검증·최초 구축 소급 시 last_crawled_at 이 최근이라도 돌려야 하므로)
  // 일반(정기 크론) 호출은 주기 도래분만 — JS에서 interval 판정.
  const dueSources = backfillDays > 0
    ? allSources
    : allSources.filter(s => {
        if (!s.crawl_interval_minutes) return false
        if (!s.last_crawled_at) return true   // 한 번도 수집하지 않은 소스 포함
        const intervalMs = s.crawl_interval_minutes * 60 * 1000
        const elapsed = Date.now() - new Date(s.last_crawled_at).getTime()
        return elapsed >= intervalMs
      })

  // 소스별 격리 실행 — 1개 실패가 전체를 멈추지 않음
  const results = await Promise.allSettled(
    dueSources.map(s => crawlOne(admin, s, since))
  )

  // 결과 집계
  let successCount = 0
  let failedCount = 0
  let totalInserted = 0
  let totalDuplicates = 0
  let totalHeld = 0

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.status === 'failed') {
        failedCount++
      } else {
        successCount++
      }
      totalInserted += result.value.counts.inserted
      totalDuplicates += result.value.counts.duplicate
      totalHeld += result.value.counts.held
    } else {
      failedCount++
      console.error('[크롤러] 예기치 않은 소스 처리 오류:', result.reason)
    }
  }

  return {
    ok: failedCount === 0,
    sources_total: dueSources.length,
    success: successCount,
    failed: failedCount,
    inserted: totalInserted,
    duplicates: totalDuplicates,
    held: totalHeld,
  }
}
