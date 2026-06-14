import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from './adapters'
import { fetchYoutubeChannel } from './adapters/youtube'
import { normalizeUrl, titleHash, bodyHash } from './normalize'
import { findByUrl, findByTitleHash, findByBodyHash, findSimilarCandidates } from './dedup'
import { titleSimilarity, SIMILARITY_THRESHOLD } from './similarity'
import { isAdLike, isExcludedByGroups, effectiveLength, relatednessScore, MIN_EFFECTIVE_LENGTH, RELATEDNESS_THRESHOLD, RELATEDNESS_GATING_ENABLED, type ScoringGroup } from './quality'
import type { CrawlCounts } from './types'
import type { ContentCategory, Source, SourceType } from '@/lib/types'
import {
  selectCrawlSources,
  type CrawlScheduleOptions,
} from '@/lib/crawler/schedule'
import {
  TRANSLATION_SEPARATOR,
  translateToKorean,
} from '@/lib/translate'

const MAX_TRANSLATIONS_PER_CRAWL = 20
const OPINION_LOOKBACK_DAYS = 7

interface TranslationBudget {
  remaining: number
}

interface TranslatedContent {
  title: string
  body: string
}

async function translateEnglishContent(
  title: string,
  body: string,
  budget: TranslationBudget
): Promise<TranslatedContent | null> {
  if (budget.remaining <= 0) return null

  budget.remaining -= 1
  const translated = await translateToKorean(
    `${title}${TRANSLATION_SEPARATOR}${body}`
  )
  if (!translated) return null

  const separatorIndex = translated.indexOf(TRANSLATION_SEPARATOR)
  if (separatorIndex < 0) {
    console.warn('[번역] 제목과 본문 구분자를 찾지 못해 원문으로 적재합니다.')
    return null
  }

  const translatedTitle = translated.slice(0, separatorIndex).trim()
  const translatedBody = translated
    .slice(separatorIndex + TRANSLATION_SEPARATOR.length)
    .trim()

  if (!translatedTitle || !translatedBody) {
    console.warn('[번역] 번역 결과가 비어 있어 원문으로 적재합니다.')
    return null
  }

  return { title: translatedTitle, body: translatedBody }
}

/** 키워드 로드 시 사용하는 최소 객체 타입 */
interface CrawlKeyword {
  id: string
  name: string
  service_id: string | null
}

/**
 * 적재된 콘텐츠에 키워드/서비스 태그를 자동 부여한다 (#24).
 * - 매칭 0건이면 아무것도 하지 않음(정상 종료).
 * - 태깅 오류는 로그만 — 적재 결과를 막지 않음.
 */
async function tagContent(
  admin: SupabaseClient,
  contentId: string,
  text: string,
  keywords: CrawlKeyword[]
): Promise<void> {
  try {
    const lower = text.toLowerCase()
    const matched = keywords.filter(k => lower.includes(k.name.toLowerCase()))
    if (matched.length === 0) return

    // content_keywords (PK: content_id, keyword_id)
    await admin.from('content_keywords').upsert(
      matched.map(k => ({ content_id: contentId, keyword_id: k.id })),
      { onConflict: 'content_id,keyword_id', ignoreDuplicates: true }
    )

    // content_services (PK: content_id, service_id) — 매칭 키워드의 distinct service_id
    const serviceIds = [...new Set(matched.map(k => k.service_id).filter((v): v is string => !!v))]
    if (serviceIds.length) {
      await admin.from('content_services').upsert(
        serviceIds.map(sid => ({ content_id: contentId, service_id: sid })),
        { onConflict: 'content_id,service_id', ignoreDuplicates: true }
      )
    }
  } catch (err) {
    console.error('[크롤러] 태깅 오류 (contentId:', contentId, '):', err)
  }
}

/** 소스별 크롤 결과 */
export interface SourceCrawlResult {
  source_id: string
  source_name: string
  status: 'success' | 'partial' | 'failed'
  counts: CrawlCounts
  error?: string
}

/** 소스별 진단 상세 (응답 가시성용) */
export interface CrawlSourceDetail {
  source: string
  status: 'success' | 'partial' | 'failed'
  fetched: number
  inserted: number
  duplicate: number
  rejected: number
  error?: string
}

/** 전체 크롤 실행 요약 (라우트 응답 형태) */
export interface CrawlSummary {
  ok: boolean
  sources_total: number
  success: number
  failed: number
  fetched: number
  inserted: number
  duplicates: number
  rejected: number
  held: number
  details: CrawlSourceDetail[]
}

export interface RunCrawlOptions extends CrawlScheduleOptions {
  sourceIds?: string[]
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

function categoryForSourceType(type: SourceType): ContentCategory {
  switch (type) {
    case 'web_insight':      return '웹인사이트'
    case 'report_publisher': return '리포트'
    case 'youtube_channel':  return '유튜브'
    default:                 return '뉴스' // news_site, (legacy)newsletter
  }
}

function sinceForSource(
  source: Source,
  defaultSince: string,
  backfillDays: number
): string {
  if (backfillDays === 0 && source.type === 'web_insight') {
    return getDaysAgoStartKst(OPINION_LOOKBACK_DAYS)
  }
  return defaultSince
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
  since: string,
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget
): Promise<SourceCrawlResult> {
  const startedAt = new Date().toISOString()
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0 }
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

        // 1단계: 원문 URL 존재 확인 (멱등의 결정적 기준)
        if (await findByUrl(admin, url)) {
          counts.duplicate++
          continue
        }
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

        // 품질 필터 단계 1: 광고성·짧은 글·도메인무관 제외 (#13, B1)
        // 완전중복이 아닌 것 중 품질 기준 미달은 미적재(rejected).
        const qText = `${item.title} ${item.body ?? ''}`
        if (
          isAdLike(qText) ||
          isExcludedByGroups(item.title, groups) ||  // keyword_groups.exclude_patterns 기반
          effectiveLength(item.title, item.body ?? null) < MIN_EFFECTIVE_LENGTH
        ) {
          counts.rejected++
          continue
        }

        // published_at 을 ISO 로 정규화 (RFC822 등 비ISO 문자열 → timestamptz 적재 실패 방어)
        let publishedAt: string | null = null
        if (item.published_at) {
          const d = new Date(item.published_at)
          publishedAt = isNaN(d.getTime()) ? null : d.toISOString()
        }

        // near-dup 그룹핑 (#12)
        // 해시 완전일치는 통과했지만 제목 유사도 ≥ SIMILARITY_THRESHOLD 인 관련 기사 확인.
        // 스킵하지 않고 cluster_id 를 부여해 "대표 1건 + 관련 N건" 구조로 적재.
        const candidates = await findSimilarCandidates(admin, publishedAt)
        const match = candidates.find(
          c => titleSimilarity(c.title, item.title) >= SIMILARITY_THRESHOLD
        )
        let clusterId: string | null = null
        if (match) {
          const repId = match.cluster_id ?? match.id  // 그룹이면 그 대표, 아니면 match 자신이 대표
          if (!match.cluster_id) {
            // match 가 단독 기사였으면 대표로 승격 (자기참조)
            await admin
              .from('contents')
              .update({ cluster_id: repId })
              .eq('id', match.id)
          }
          clusterId = repId
          console.log(`[크롤러] 관련기사 그룹 편입: "${item.title}" → cluster ${repId}`)
        }

        // 품질 필터 단계 2: 가중 관련도 게이트 (B1)
        // groups 가 비어 있으면 0점 → 신뢰 소스(trust_tier >= 2)로 전부 면제.
        // RELATEDNESS_GATING_ENABLED = true 이므로 실제 보류 발생.
        const score = relatednessScore(item.title, item.body ?? '', groups)
        const importance = score
        const exempt = source.trust_tier >= 2 || groups.length === 0
        const contentStatus: 'pending' | 'published' =
          (!exempt && RELATEDNESS_GATING_ENABLED && score < RELATEDNESS_THRESHOLD)
            ? 'pending' : 'published'

        const translatedContent =
          item.language === 'en' && item.body
            ? await translateEnglishContent(
                item.title,
                item.body,
                translationBudget
              )
            : null

        // 콘텐츠 행 구성
        // - view_count·bookmark_count·is_editor_pick 은 payload 제외 → DB 기본값 사용
        // - cluster_id 는 near-dup 그룹핑 결과 직접 포함 (신규 행에만 적용)
        // - status 는 품질 필터 결과 포함 (published | pending)
        // - is_published 컬럼 없음 (status enum 사용)
        const row = {
          category: categoryForSourceType(source.type),
          source_id: source.id,
          title: translatedContent?.title ?? item.title,
          title_original: translatedContent ? item.title : null,
          body_original: item.body ?? null,
          body_translated_ko: translatedContent?.body ?? null,
          original_url: url,
          original_language: item.language ?? 'ko',
          author: item.author ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
          title_hash: tHash,
          body_hash: bHash,
          published_at: publishedAt,
          collected_at: new Date().toISOString(),
          cluster_id: clusterId,
          importance_score: importance,
          status: contentStatus,
        }

        // 적재: contents_original_url_key 가 부분 유니크 인덱스(where original_url is not null)라
        // upsert ON CONFLICT 와 호환되지 않음 → insert 사용. URL 중복(23505)은 멱등 스킵.
        const { data: insertedRows, error: insertError } = await admin
          .from('contents')
          .insert(row)
          .select('id')
        if (insertError) {
          if (insertError.code === '23505') {
            counts.duplicate++   // 같은 original_url 이미 존재 → 멱등 스킵
          } else {
            console.error(`[크롤러] insert 오류 (${url}):`, insertError.message)
            crawlStatus = 'partial'
            if (!errorMessage) errorMessage = `${insertError.code ?? ''} ${insertError.message}`.trim()
          }
        } else {
          // 보류(pending)이면 held, 게시(published)이면 inserted 로 집계
          if (contentStatus === 'pending') counts.held++
          else counts.inserted++
          // 신규 적재 성공 시 서비스/키워드 태깅 (#24)
          const newId = insertedRows?.[0]?.id as string | undefined
          if (newId) await tagContent(admin, newId, qText, keywords)
        }
      } catch (itemErr) {
        // 개별 아이템 오류는 partial 처리 후 계속
        console.error('[크롤러] 아이템 처리 오류:', itemErr)
        crawlStatus = 'partial'
        if (!errorMessage) errorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr)
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

/**
 * YouTube 채널 소스 1개 수집 — youtube_videos 에 멱등 적재.
 * - video_id 유니크 제약(23505) = 중복, 그 외 오류 = partial.
 * - since 필터 없음(video_id 유니크로 멱등 보장).
 */
async function crawlYoutube(
  admin: SupabaseClient,
  source: Source
): Promise<SourceCrawlResult> {
  const startedAt = new Date().toISOString()
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0 }
  let crawlStatus: 'success' | 'partial' | 'failed' = 'success'
  let errorMessage: string | undefined

  try {
    // 3회 지수 백오프 재시도 (0.5s · 1s · 2s) — 뉴스 경로와 동일
    const { feedTitle, items } = await withRetry(
      () => fetchYoutubeChannel(source),
      3,
      [500, 1000, 2000]
    )
    counts.fetched = items.length

    for (const item of items) {
      try {
        const row = {
          source_id:        source.id,
          video_id:         item.videoId,
          title:            item.title,
          channel_name:     feedTitle,
          channel_id:       item.channelId,
          description:      null,
          thumbnail_url:    `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
          duration_seconds: null,
          view_count:       null,
          published_at:     item.published_at,
          collected_at:     new Date().toISOString(),
        }

        const { error: insertError } = await admin
          .from('youtube_videos')
          .insert(row)

        if (insertError) {
          if (insertError.code === '23505') {
            counts.duplicate++   // video_id 이미 존재 → 멱등 스킵
          } else {
            console.error(`[크롤러] youtube_videos insert 오류 (${item.videoId}):`, insertError.message)
            crawlStatus = 'partial'
            if (!errorMessage) errorMessage = `${insertError.code ?? ''} ${insertError.message}`.trim()
          }
        } else {
          counts.inserted++
        }
      } catch (itemErr) {
        console.error('[크롤러] 유튜브 아이템 처리 오류:', itemErr)
        crawlStatus = 'partial'
        if (!errorMessage) errorMessage = itemErr instanceof Error ? itemErr.message : String(itemErr)
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
    console.error(`[크롤러] 유튜브 소스 "${source.name}" 수집 실패:`, errorMessage)
  }

  const finishedAt = new Date().toISOString()
  await writeCrawlLog(admin, source.id, crawlStatus, counts, startedAt, finishedAt, errorMessage)

  return {
    source_id:   source.id,
    source_name: source.name,
    status:      crawlStatus,
    counts,
    error:       errorMessage,
  }
}

/** 전체 크롤 실행 — Orchestrator 진입점
 *  @param options.backfillDays 소급 수집 일수(1~30). 미지정/0 이면 당일(KST 0시 이후)만.
 *  @param options.force true 이면 주기와 관계없이 활성 소스를 모두 실행. */
export async function runCrawl(options: RunCrawlOptions = {}): Promise<CrawlSummary> {
  const backfillDays =
    options.backfillDays && options.backfillDays > 0
      ? Math.min(Math.floor(options.backfillDays), 30)
      : 0
  const since = backfillDays > 0 ? getDaysAgoStartKst(backfillDays) : getTodayStartKst()

  let admin: SupabaseClient
  let rawSources: Source[]
  let keywords: CrawlKeyword[]
  let groups: ScoringGroup[]

  try {
    admin = createAdminClient()
    const [sourcesResult, keywordsResult, groupsResult] = await Promise.all([
      admin.from('sources').select('*').eq('is_active', true),
      admin.from('keywords').select('id, name, service_id'),
      admin.from('keyword_groups')
        .select('include_patterns, exclude_patterns, weight')
        .eq('is_active', true),
    ])

    if (sourcesResult.error) throw sourcesResult.error
    if (keywordsResult.error) throw keywordsResult.error
    if (groupsResult.error) throw groupsResult.error

    rawSources = (sourcesResult.data ?? []) as Source[]
    keywords = (keywordsResult.data ?? []) as CrawlKeyword[]
    groups = (groupsResult.data ?? []) as ScoringGroup[]
  } catch (error) {
    console.error('[크롤러] 수집 준비 단계 오류:', error)
    throw new Error('수집 준비 중 오류가 발생했습니다. 서버 설정을 확인해주세요.')
  }

  const translationBudget: TranslationBudget = {
    remaining: MAX_TRANSLATIONS_PER_CRAWL,
  }

  const scoped = options.sourceIds?.length
    ? rawSources.filter(s => options.sourceIds!.includes(s.id))
    : rawSources

  const dueSources = selectCrawlSources(
    scoped,
    { backfillDays, force: options.force }
  )

  // 소스별 격리 실행 — 1개 실패가 전체를 멈추지 않음
  // youtube_channel → crawlYoutube, 그 외(news_site 등) → crawlOne
  const results = await Promise.allSettled(
    dueSources.map(s =>
      s.type === 'youtube_channel'
        ? crawlYoutube(admin, s)
        : crawlOne(
            admin,
            s,
            sinceForSource(s, since, backfillDays),
            keywords,
            groups,
            translationBudget
          )
    )
  )

  // 결과 집계
  let successCount = 0
  let failedCount = 0
  let totalFetched = 0
  let totalInserted = 0
  let totalDuplicates = 0
  let totalRejected = 0
  let totalHeld = 0
  const details: CrawlSourceDetail[] = []

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value
      if (r.status === 'failed') {
        failedCount++
      } else {
        successCount++
      }
      totalFetched += r.counts.fetched
      totalInserted += r.counts.inserted
      totalDuplicates += r.counts.duplicate
      totalRejected += r.counts.rejected
      totalHeld += r.counts.held
      details.push({
        source: r.source_name,
        status: r.status,
        fetched: r.counts.fetched,
        inserted: r.counts.inserted,
        duplicate: r.counts.duplicate,
        rejected: r.counts.rejected,
        error: r.error,
      })
    } else {
      failedCount++
      console.error('[크롤러] 예기치 않은 소스 처리 오류:', result.reason)
      details.push({
        source: '(unknown)',
        status: 'failed',
        fetched: 0,
        inserted: 0,
        duplicate: 0,
        rejected: 0,
        error: String(result.reason),
      })
    }
  }

  return {
    ok: failedCount === 0,
    sources_total: dueSources.length,
    success: successCount,
    failed: failedCount,
    fetched: totalFetched,
    inserted: totalInserted,
    duplicates: totalDuplicates,
    rejected: totalRejected,
    held: totalHeld,
    details,
  }
}
