import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from './adapters'
import { fetchYoutubeChannel } from './adapters/youtube'
import { normalizeUrl, titleHash, bodyHash } from './normalize'
import { findByUrl, findByTitleHash, findByBodyHash, findSimilarCandidates } from './dedup'
import { titleSimilarity, SIMILARITY_THRESHOLD } from './similarity'
import { isAdLike, isExcludedByGroups, effectiveLength, bodyLength, relatednessScore, matchKeywordGroups, matchIssues, assessBodyQuality, matchExclusion, MIN_EFFECTIVE_LENGTH, DEFAULT_MIN_BODY_LENGTH, RELATEDNESS_THRESHOLD, RELATEDNESS_GATING_ENABLED, type ScoringGroup, type IssueMatchDef, type ReviewReason, type ExclusionRule } from './quality'
import { sharesCoreTokens } from './similarity'
import type { CrawlCounts, RawItem } from './types'
import { zeroRejectedBy } from './types'
import type { ContentCategory, Source, SourceType } from '@/lib/types'
import {
  selectCrawlSources,
  type CrawlScheduleOptions,
} from '@/lib/crawler/schedule'
import {
  TRANSLATION_SEPARATOR,
  translateToKorean,
} from '@/lib/translate'
import { SUMMARY_MIN_BODY_LEN } from './summarize'
import { classifyRelevance } from './classify'
import { extract } from '@extractus/article-extractor'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { applyBodySuccessUpdate, markBodyRetryOrGiveUp } from '@/lib/contents/enrich-body'
import { resolveArticleUrl } from './resolve-url'
import { fetchAndSaveYoutubeTranscript } from './youtube-transcript'
import { fetchNaverNews } from './adapters/naver-news'
import { fetchGdeltNews } from './adapters/gdelt-news'
import { hasGdeltCredentials, queryGdeltMonth } from './gdelt-bigquery'

const MAX_TRANSLATIONS_PER_CRAWL = 20
const MAX_LLM_CLASSIFY_PER_CRAWL = 40
// 265 — 유튜브 자막 수집(비공식 엔드포인트, rate limit 위험) 크롤당 상한. 나머지는 어드민 백필로.
const MAX_TRANSCRIPTS_PER_CRAWL = 15
const RELATEDNESS_MARGIN = 0.15
const MAX_MERGED_TAGS = 8
const OPINION_LOOKBACK_DAYS = 7

// enrichment(풀본문 보강) 상수
// 30→100(2026-07-13): 구글뉴스 신규 인코딩 URL 미해소로 하루 100건 넘게 body_short에 밀리던
// 문제(resolve-url.ts 디코드 추가로 근본 수정)의 잔여 적체 해소용. 루프 내부 소프트 데드라인
// (CRAWL_SOFT_DEADLINE_MS, enrichRecentContents 호출부에서 전달)이 총 처리 시간을 이미
// 보장하므로 상한만 올려도 크롤 1회 시간 초과 위험은 없다.
const MAX_ENRICH_PER_CRAWL = 100
const ENRICH_MIN_BODY_LEN = 400

// ── 키워드 검색 수집 상수 ────────────────────────────────────────────────
const KEYWORD_LOOKBACK_DAYS = 2
const MAX_SEARCH_SEEDS = 30
const googleNewsRss = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`

// ── 회사 seed 검색 수집(259) 상수 ───────────────────────────────────────
const MAX_COMPANY_SEEDS = 120
const COMPANY_SEARCH_BUDGET_MS = 20_000

// maxDuration(300초) 안에서 우아하게 멈추기 위한 크롤 전체 소프트 데드라인.
// 하드킬(강제종료)과 달리 여기 걸리면 runJob 이 정상적으로 succeeded/partial 로 기록한다.
const CRAWL_SOFT_DEADLINE_MS = 270_000

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

/**
 * 유튜브 콘텐츠 분류·엔티티 태깅(252) — 뉴스 파이프라인의 matchKeywordGroups·
 * content_entities 링킹을 제목 기준으로 재사용(본문 없음). 크롤러·백필 공용.
 * SQL 미적용(42703)·엔티티 없음 등은 모두 graceful — 실패해도 예외 전파 안 함.
 */
export async function tagYoutubeContent(
  admin: SupabaseClient,
  contentId: string,
  title: string,
  groups: ScoringGroup[],
  aliasMap: Map<string, string>
): Promise<void> {
  const matchedTags = matchKeywordGroups(title, '', groups)
  try {
    const { error: tagErr } = await admin
      .from('contents')
      .update({ matched_groups: matchedTags.groups, matched_keywords: matchedTags.keywords.slice(0, MAX_MERGED_TAGS) })
      .eq('id', contentId)
    if (tagErr) console.error('[크롤러] 유튜브 매칭 태그 적재 실패(컬럼 미적용 가능):', tagErr.message)
  } catch (e) {
    console.error('[크롤러] 유튜브 매칭 태그 적재 실패(컬럼 미적용 가능):', e)
  }

  try {
    if (aliasMap.size > 0 && matchedTags.keywords.length > 0) {
      const entityIds = [...new Set(
        matchedTags.keywords
          .map(kw => aliasMap.get(kw.toLowerCase()))
          .filter((id): id is string => id !== undefined)
      )]
      if (entityIds.length > 0) {
        const entityRows = entityIds.map(entity_id => ({
          content_id: contentId,
          entity_id,
          source: 'rule',
          score: 1.0,
        }))
        const { error: entErr } = await admin
          .from('content_entities')
          .upsert(entityRows, { onConflict: 'content_id,entity_id', ignoreDuplicates: true })
        if (entErr) console.error('[크롤러] 유튜브 content_entities 적재 실패(SQL 99 미적용 가능):', entErr.message)
      }
    }
  } catch (e) {
    console.error('[크롤러] 유튜브 content_entities 적재 실패(SQL 99 미적용 가능):', e)
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

/** 검색 공급자별 원본 수집량. 기존 fetched 총계와 별도로 운영 진단에만 사용한다. */
export interface CrawlProviderCounts {
  keyword_google: number
  keyword_naver: number
  keyword_gdelt: number
  company_google: number
  keyword_phase_skipped: boolean
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
  providers: CrawlProviderCounts
  /** ok=false(전체 실패) 사유 요약 — run-job.ts 의 job_runs.error 에 그대로 기록됨.
   *  ok=true(부분 실패 포함 성공)여도 problem 소스가 있으면 채워서 job_runs.meta.error 로
   *  경고 흔적을 남긴다. */
  error?: string
}

export interface RunCrawlOptions extends CrawlScheduleOptions {
  sourceIds?: string[]
  gdeltBackfill?: { from: string; to: string }
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

/**
 * crawl_logs 테이블에 수집 결과 기록.
 * rejected_count/rejected_by(312)는 SQL 핸드오프(312-crawl_logs-rejected.sql) 미적용 시
 * undefined_column(42703)으로 insert 전체가 실패할 수 있어 — 그 경우 두 컬럼을 빼고 재시도한다
 * (기존 컬럼 기록까지 막히면 안 된다).
 */
async function writeCrawlLog(
  admin: SupabaseClient,
  sourceId: string,
  status: 'success' | 'partial' | 'failed',
  counts: CrawlCounts,
  startedAt: string,
  finishedAt: string,
  errorMessage?: string
): Promise<void> {
  const baseRow = {
    source_id: sourceId,
    status,
    fetched_count: counts.fetched,
    inserted_count: counts.inserted,
    duplicate_count: counts.duplicate,
    held_count: counts.held,
    error_message: errorMessage ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
  }

  const { error } = await admin.from('crawl_logs').insert({
    ...baseRow,
    rejected_count: counts.rejected,
    rejected_by: counts.rejectedBy,
  })

  if (error?.code === '42703') {
    console.error('[크롤러] crawl_logs.rejected_count/rejected_by 컬럼 미적용(312 SQL 미실행) — 해당 컬럼 없이 기록:', error.message)
    const { error: retryError } = await admin.from('crawl_logs').insert(baseRow)
    if (retryError) {
      console.error('[크롤러] crawl_logs 기록 오류(재시도):', retryError.message)
    }
    return
  }

  if (error) {
    console.error('[크롤러] crawl_logs 기록 오류:', error.message)
  }
}

/**
 * 아이템 처리에 필요한 소스 컨텍스트 (소스 등록 없는 경우 id=null 허용).
 */
interface ItemSourceCtx {
  id: string | null
  type: SourceType
  trust_tier: number
  /** 키워드/회사 seed 검색(Google News RSS) 경로 아이템 — source_id=null 로만 구분되던 것을
   *  명시적 플래그로 노출. RSS description 이 실제 본문이 아니라 제목을 감싼 링크라 본문
   *  최소길이(minBodyLength) 게이트를 구조적으로 통과 못 해 전량 rejected 되던 문제(2026-07-12
   *  §5 재검증) 때문에, 이 아이템만 그 게이트를 면제한다. insert 후 enrichRecentContents 가
   *  풀본문을 채운다. 정규 소스 폴링 아이템의 품질 게이팅은 그대로 유지된다. */
  isSearchSourced?: boolean
}

/**
 * 아이템 1건 처리: dedup → 품질/EXCLUDE → near-dup cluster → 게이트/importance
 *   → 번역 → insert → tagContent → counts 갱신.
 *
 * crawlOne 과 crawlKeywordSearch 가 공유하는 파이프라인 — 동작 불변.
 * counts 는 참조(in-place)로 갱신된다.
 *
 * @returns partial=true 이면 호출부에서 status='partial' 처리 필요.
 */
async function processCrawlItem(
  admin: SupabaseClient,
  item: RawItem,
  src: ItemSourceCtx,
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  counts: CrawlCounts,
  aliasMap: Map<string, string> = new Map(),
  issueList: IssueMatchDef[] = [],
  exclusionRules: ExclusionRule[] = [],
  exclusionHits: Map<string, number> = new Map(),
  minBodyLength: number = DEFAULT_MIN_BODY_LENGTH
): Promise<{ partial?: true; errorMessage?: string }> {
  try {
    const url = normalizeUrl(item.original_url)
    const tHash = titleHash(item.title)
    const bHash = bodyHash(item.body)

    // 1단계: 원문 URL 존재 확인 (멱등의 결정적 기준)
    if (await findByUrl(admin, url)) {
      counts.duplicate++
      return {}
    }
    // 2단계: 본문 해시 완전일치 중복 확인
    if (await findByBodyHash(admin, bHash)) {
      counts.duplicate++
      return {}
    }
    // 3단계: 제목 해시 완전일치 중복 확인
    if (await findByTitleHash(admin, tHash)) {
      counts.duplicate++
      return {}
    }

    // 품질 필터 단계 1: 광고성·짧은 글·도메인무관 제외 (#13, B1)
    // 완전중복이 아닌 것 중 품질 기준 미달은 미적재(rejected).
    const qText = `${item.title} ${item.body ?? ''}`
    // 제외 규칙(190) — 도메인/URL/제목 부분일치. reject 는 기존 제외와 동급 처리, hold 는 아래서 검토 대기 사유로 반영.
    const exclusionMatch = matchExclusion({ title: item.title, url }, exclusionRules)
    if (exclusionMatch) {
      exclusionHits.set(exclusionMatch.ruleId, (exclusionHits.get(exclusionMatch.ruleId) ?? 0) + 1)
    }
    // 키워드/회사 seed 검색(Google News RSS) 아이템은 본문 최소길이 게이트 면제(위 ItemSourceCtx
    // 주석 참고) — 정규 소스 폴링 아이템은 그대로 적용.
    // 312 — 판정 순서·결과는 기존 || 체인과 동일(첫 매칭에서 즉시 reject). 어느 사유로
    // 걸렸는지만 if/else 로 분리해 rejectedBy 에 기록한다(세는 방식만 바꾼다, 회귀 가드).
    if (isAdLike(qText)) {
      counts.rejected++
      counts.rejectedBy.ad++
      return {}
    }
    if (isExcludedByGroups(item.title, groups)) {  // keyword_groups.exclude_patterns 기반
      counts.rejected++
      counts.rejectedBy.excludedGroup++
      return {}
    }
    if (effectiveLength(item.title, item.body ?? null) < MIN_EFFECTIVE_LENGTH) {
      counts.rejected++
      counts.rejectedBy.tooShort++
      return {}
    }
    const bodyShort = !src.isSearchSourced && bodyLength(item.body ?? null) < minBodyLength
    if (exclusionMatch?.action === 'reject') {
      counts.rejected++
      counts.rejectedBy.excludeRule++
      return {}
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
      c =>
        titleSimilarity(c.title, item.title) >= SIMILARITY_THRESHOLD ||
        sharesCoreTokens(c.title, item.title)
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

    // 품질 필터 단계 2: 가중 관련도 게이트 (B1 + B3-2 LLM 재판정)
    const score = relatednessScore(item.title, item.body ?? '', groups)
    const importance = score
    const exempt = src.trust_tier >= 2 || groups.length === 0 || src.type === 'web_insight'
    const exclusionHold = exclusionMatch?.action === 'hold'
    let contentStatus: 'pending' | 'published' =
      exclusionHold || (!exempt && RELATEDNESS_GATING_ENABLED && score < RELATEDNESS_THRESHOLD)
        ? 'pending' : 'published'
    let reviewReason: ReviewReason | null =
      exclusionHold ? 'excluded_rule' : (contentStatus === 'pending' ? 'low_relevance' : null)

    // LLM 재판정: 애매 밴드(THRESHOLD ± MARGIN)의 기사만, 면제 소스 제외
    let llmTags: string[] = []
    const inAmbiguousBand =
      RELATEDNESS_GATING_ENABLED &&
      !exempt &&
      !exclusionHold &&  // 190: 제외 규칙 hold 는 관련도 재판정으로 덮어쓰지 않음
      classifyBudget.remaining > 0 &&
      score >= (RELATEDNESS_THRESHOLD - RELATEDNESS_MARGIN) &&
      score < (RELATEDNESS_THRESHOLD + RELATEDNESS_MARGIN)

    if (inAmbiguousBand) {
      classifyBudget.remaining--
      const activeGroupNames = groups.map(g => g.name)
      const verdict = await classifyRelevance(
        item.title,
        item.body ?? '',
        activeGroupNames
      )
      if (verdict !== null) {
        contentStatus = verdict.relevant ? 'published' : 'pending'
        reviewReason = verdict.relevant ? null : 'llm_irrelevant'
        llmTags = verdict.tags
      }
    }

    // 본문 품질 게이트(178) — 누락/추출실패/잘림 의심이면 pending.
    // 단순 짧음(body_short)은 신뢰 소스(exempt)는 스니펫 홍수 방지를 위해 면제.
    const bodyReason = assessBodyQuality(item.body, { minLen: SUMMARY_MIN_BODY_LEN })
    if (bodyReason && !(exempt && bodyReason === 'body_short')) {
      contentStatus = 'pending'
      reviewReason = reviewReason ?? bodyReason
    }
    if (contentStatus === 'published') reviewReason = null
    // 짧은 RSS 본문은 관련도 판정 결과와 무관하게 풀본문 보강 전까지 보류한다.
    if (bodyShort) {
      contentStatus = 'pending'
      reviewReason = 'body_short'
    }

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
      category: categoryForSourceType(src.type),
      source_id: src.id,
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
      review_reason: reviewReason,
    }

    // 적재: contents_original_url_key 가 부분 유니크 인덱스(where original_url is not null)라
    // upsert ON CONFLICT 와 호환되지 않음 → insert 사용. URL 중복(23505)은 멱등 스킵.
    let insertRes = await admin
      .from('contents')
      .insert(row)
      .select('id')
    // review_reason 컬럼 미적용(42703) — 컬럼 제외 후 재시도 (148/155 graceful 패턴)
    if (insertRes.error?.code === '42703') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { review_reason: _reviewReason, ...rowWithoutReason } = row
      insertRes = await admin
        .from('contents')
        .insert(rowWithoutReason)
        .select('id')
    }
    const { data: insertedRows, error: insertError } = insertRes
    if (insertError) {
      if (insertError.code === '23505') {
        counts.duplicate++   // 같은 original_url 이미 존재 → 멱등 스킵
      } else {
        console.error(`[크롤러] insert 오류 (${url}):`, insertError.message)
        return {
          partial: true,
          errorMessage: `${insertError.code ?? ''} ${insertError.message}`.trim(),
        }
      }
    } else {
      // 보류(pending)이면 held, 게시(published)이면 inserted 로 집계
      if (contentStatus === 'pending') counts.held++
      else counts.inserted++
      // 신규 적재 성공 시 서비스/키워드 태깅 (#24) + 그룹/키워드 해시태그 적재 (B3a)
      const newId = insertedRows?.[0]?.id as string | undefined
      if (newId) {
        await tagContent(admin, newId, qText, keywords)
        // post-insert update — 컬럼 없어도 insert 안 깨지게 try/catch로 격리
        const matchedTags = matchKeywordGroups(item.title, item.body ?? '', groups)
        try {
          // matched_keywords: 결정적 키워드 + LLM 보조 태그 병합(중복제거·상한)
          const mergedKeywords = [
            ...matchedTags.keywords,
            ...llmTags.filter(t => !matchedTags.keywords.includes(t)),
          ].slice(0, MAX_MERGED_TAGS)
          const { error: tagErr } = await admin
            .from('contents')
            .update({ matched_groups: matchedTags.groups, matched_keywords: mergedKeywords })
            .eq('id', newId)
          if (tagErr) console.error('[크롤러] 매칭 태그 적재 실패(컬럼 미적용 가능):', tagErr.message)
        } catch (e) {
          console.error('[크롤러] 매칭 태그 적재 실패(컬럼 미적용 가능):', e)
        }

        // post-insert: rule 기반 content_signals 적재 (B4)
        // SQL 65 미적용 시 insert 실패 → try/catch 격리로 크롤 무중단
        try {
          const signalTypes = [
            ...new Set(
              groups
                .filter(g => matchedTags.groups.includes(g.name) && g.signal_hint)
                .map(g => g.signal_hint as string)
            ),
          ]
          if (signalTypes.length > 0) {
            const signalRows = signalTypes.map(signal_type => ({
              content_id: newId,
              signal_type,
              score: 1.0,
              source: 'rule',
            }))
            const { error: sigErr } = await admin
              .from('content_signals')
              .upsert(signalRows, { onConflict: 'content_id,signal_type', ignoreDuplicates: true })
            if (sigErr) console.error('[크롤러] content_signals 적재 실패(SQL 65 미적용 가능):', sigErr.message)
          }
        } catch (e) {
          console.error('[크롤러] content_signals 적재 실패(SQL 65 미적용 가능):', e)
        }

        // post-insert: 엔티티 링킹 (99) — matched_keywords ↔ alias 맵 → content_entities
        // SQL 99 미적용 시 upsert 실패 → try/catch 격리로 크롤 무중단
        try {
          if (aliasMap.size > 0) {
            const mergedKws: string[] = [
              ...matchedTags.keywords,
              ...llmTags.filter(t => !matchedTags.keywords.includes(t)),
            ].slice(0, MAX_MERGED_TAGS)
            const entityIds = [...new Set(
              mergedKws
                .map(kw => aliasMap.get(kw.toLowerCase()))
                .filter((id): id is string => id !== undefined)
            )]
            if (entityIds.length > 0) {
              const entityRows = entityIds.map(entity_id => ({
                content_id: newId,
                entity_id,
                source: 'rule',
                score: 1.0,
              }))
              const { error: entErr } = await admin
                .from('content_entities')
                .upsert(entityRows, { onConflict: 'content_id,entity_id', ignoreDuplicates: true })
              if (entErr) console.error('[크롤러] content_entities 적재 실패(SQL 99 미적용 가능):', entErr.message)
            }
          }
        } catch (e) {
          console.error('[크롤러] content_entities 적재 실패(SQL 99 미적용 가능):', e)
        }

        // post-insert: 이슈 자동배정 (101) — match_keywords 텍스트매칭 → issue_contents
        // SQL 101 미적용 시 upsert 실패 → try/catch 격리로 크롤 무중단
        try {
          if (issueList.length > 0) {
            const matchedIssueIds = matchIssues(item.title, item.body ?? '', issueList)
            if (matchedIssueIds.length > 0) {
              const issueRows = matchedIssueIds.map(issue_id => ({
                issue_id,
                content_id: newId,
                source: 'rule',
              }))
              const { error: issueErr } = await admin
                .from('issue_contents')
                .upsert(issueRows, { onConflict: 'issue_id,content_id', ignoreDuplicates: true })
              if (issueErr) console.error('[크롤러] issue_contents 적재 실패(SQL 101 미적용 가능):', issueErr.message)
            }
          }
        } catch (e) {
          console.error('[크롤러] issue_contents 적재 실패(SQL 101 미적용 가능):', e)
        }

        // 한국어 요약(B3-1)은 크롤 크리티컬 패스에서 제외 — /api/cron/summary-backfill(05:20 KST)로 이관.
        // summary_ko IS NULL 인 published 콘텐츠는 그 배치가 채운다(지시서_20260712_크롤-요약분리).
      }
    }

    return {}
  } catch (itemErr) {
    // 개별 아이템 오류는 partial 처리 후 계속
    console.error('[크롤러] 아이템 처리 오류:', itemErr)
    return {
      partial: true,
      errorMessage: itemErr instanceof Error ? itemErr.message : String(itemErr),
    }
  }
}

/** 소스 1개 크롤링 실행 */
async function crawlOne(
  admin: SupabaseClient,
  source: Source,
  since: string,
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  aliasMap: Map<string, string> = new Map(),
  issueList: IssueMatchDef[] = [],
  exclusionRules: ExclusionRule[] = [],
  exclusionHits: Map<string, number> = new Map(),
  minBodyLength: number = DEFAULT_MIN_BODY_LENGTH,
  deadline?: number
): Promise<SourceCrawlResult> {
  const startedAt = new Date().toISOString()
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0, rejectedBy: zeroRejectedBy() }
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

    const srcCtx: ItemSourceCtx = {
      id: source.id,
      type: source.type,
      trust_tier: source.trust_tier,
    }

    for (const item of rawItems) {
      // 소프트 데드라인(runCrawl 전체) 초과 시 나머지 아이템 skip — maxDuration 하드킬 방지.
      // backfillDays 로 아이템 수가 크게 늘어날 때(예: 30일치) 특히 중요.
      if (deadline !== undefined && Date.now() >= deadline) {
        crawlStatus = 'partial'
        if (!errorMessage) errorMessage = '소프트 데드라인 초과로 나머지 아이템 건너뜀'
        break
      }
      const result = await processCrawlItem(
        admin, item, srcCtx, keywords, groups, translationBudget, classifyBudget, counts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
      )
      if (result.partial) {
        crawlStatus = 'partial'
        if (!errorMessage) errorMessage = result.errorMessage
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
 * - 252: contents mirror 적재 후 뉴스와 동일한 분류(matched_groups/keywords)·
 *   엔티티 링킹(content_entities)을 제목 기준으로 적용(본문 없음 → 제목만 매칭).
 */
async function crawlYoutube(
  admin: SupabaseClient,
  source: Source,
  groups: ScoringGroup[],
  aliasMap: Map<string, string>,
  transcriptBudget: TranslationBudget,
  deadline?: number
): Promise<SourceCrawlResult> {
  const startedAt = new Date().toISOString()
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0, rejectedBy: zeroRejectedBy() }
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
      // 소프트 데드라인 초과 시 나머지 영상 skip(자막 수집 등 아이템당 비용이 큼) — maxDuration 하드킬 방지.
      if (deadline !== undefined && Date.now() >= deadline) {
        crawlStatus = 'partial'
        if (!errorMessage) errorMessage = '소프트 데드라인 초과로 나머지 영상 건너뜀'
        break
      }
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
        // contents 테이블에도 mirror insert (어드민 콘텐츠 관리 통합)
        const { data: mirrorRows, error: contentMirrorError } = await admin
          .from('contents')
          .insert({
            category:          '유튜브',
            source_id:         source.id,
            title:             item.title,
            original_url:      `https://www.youtube.com/watch?v=${item.videoId}`,
            thumbnail_url:     `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
            author:            feedTitle,
            published_at:      item.published_at,
            collected_at:      new Date().toISOString(),
            original_language: 'ko',
            status:            'published',
          })
          .select('id')
        if (contentMirrorError && contentMirrorError.code !== '23505') {
          console.error(`[크롤러] contents mirror insert 오류 (${item.videoId}):`, contentMirrorError.message)
        }
        const mirrorId = mirrorRows?.[0]?.id as string | undefined
        if (mirrorId) {
          await tagYoutubeContent(admin, mirrorId, item.title, groups, aliasMap)

          // 유튜브 요약(266)은 크롤 크리티컬 패스에서 제외 — /api/cron/summary-backfill 로 이관.

          // 자막 수집·번역 1회 시도(265) — budget 소진 시 스킵(나머지는 어드민 백필에서 처리)
          if (transcriptBudget.remaining > 0) {
            transcriptBudget.remaining--
            try {
              await fetchAndSaveYoutubeTranscript(admin, mirrorId, item.videoId)
            } catch (e) {
              console.error('[크롤러] 유튜브 자막 수집 실패:', e)
            }
          }
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

/**
 * 키워드 기반 Google News RSS 수집.
 * - seeds: keyword_groups.search_seeds 합집합(중복제거, 상한적용)
 * - 기존 파이프라인(processCrawlItem)을 그대로 재사용 — 중복·게이트 자동 처리.
 * - source_id=null, trust_tier=1(게이트 적용).
 * - seed 가 순차(for-of) 처리라 seed 1개당 RSS fetch + 아이템별 dedup 쿼리(최대 3회)가
 *   전부 직렬로 쌓인다. seed 수가 더 늘면(현재 MAX_SEARCH_SEEDS=30) deadline 안에도
 *   못 끝날 수 있으니, 그때는 회사 seed 검색처럼 Promise.allSettled 기반 병렬 처리로
 *   바꾸는 걸 검토할 것(2026-07-12 §5 재검증 — 30 seed 기준 아직은 순차로 충분).
 */
async function crawlKeywordSearch(
  admin: SupabaseClient,
  seeds: string[],
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  aliasMap: Map<string, string> = new Map(),
  issueList: IssueMatchDef[] = [],
  exclusionRules: ExclusionRule[] = [],
  exclusionHits: Map<string, number> = new Map(),
  minBodyLength: number = DEFAULT_MIN_BODY_LENGTH,
  deadline?: number
): Promise<{
  counts: CrawlCounts
  providerFetched: { google: number; naver: number; gdelt: number }
  hadError: boolean
  truncated: boolean
  firstError?: string
}> {
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0, rejectedBy: zeroRejectedBy() }
  const providerFetched = { google: 0, naver: 0, gdelt: 0 }
  let hadError = false
  let truncated = false
  let firstError: string | undefined
  const since = getDaysAgoStartKst(KEYWORD_LOOKBACK_DAYS)
  const adapter = getAdapter('news_site')!
  const srcCtx: ItemSourceCtx = { id: null, type: 'news_site', trust_tier: 1, isSearchSourced: true }

  for (const seed of seeds) {
    if (deadline !== undefined && Date.now() >= deadline) {
      // 소프트 데드라인 초과 — 남은 seed 는 건너뜀(다음 크롤 회차에서 이어감). 하드킬 대신 우아한 중단.
      truncated = true
      break
    }
    try {
      // news-site 어댑터 재사용: rss_url 만 실제로 사용됨
      const syntheticSource = {
        rss_url: googleNewsRss(seed),
        name: `Google News: ${seed}`,
      } as unknown as Source

      const rawItems = await withRetry(
        () => adapter.fetch(syntheticSource, since),
        3,
        [500, 1000, 2000]
      )
      providerFetched.google += rawItems.length
      const naverItems = await fetchNaverNews(seed, since, { maxItems: 200 })
      providerFetched.naver += naverItems.length
      const gdeltItems = await fetchGdeltNews(seed, since)
      providerFetched.gdelt += gdeltItems.length
      const searchItems = [...rawItems, ...naverItems, ...gdeltItems]
      counts.fetched += searchItems.length

      for (const item of searchItems) {
        const result = await processCrawlItem(
          admin, item, srcCtx, keywords, groups, translationBudget, classifyBudget, counts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
        )
        if (result.partial) {
          hadError = true
          if (!firstError) firstError = `seed "${seed}": ${result.errorMessage ?? '아이템 처리 실패'}`
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[크롤러] 키워드 검색 오류 (seed: "${seed}"):`, message)
      hadError = true
      if (!firstError) firstError = `seed "${seed}": ${message}`
    }
  }

  return { counts, providerFetched, hadError, truncated, firstError }
}

/** curated_companies(253) 최소 조회 타입 — 회사 seed 검색용 */
interface CuratedCompanyRow {
  name: string
  aliases: string[]
}

/** 2자 이하 영문 약어(예: MS·KB)는 오탐 유발이 커서 단독 seed 로 쓰지 않음. */
function isGenericAlias(alias: string): boolean {
  return alias.length <= 2 && /^[a-zA-Z]+$/.test(alias)
}

/** curated_companies name + aliases 합집합(dedup) → 회사 seed 목록, 상한 적용. */
function buildCompanySeeds(companies: CuratedCompanyRow[]): string[] {
  const seeds = new Set<string>()
  for (const c of companies) {
    if (c.name) seeds.add(c.name)
    for (const alias of c.aliases ?? []) {
      if (alias && !isGenericAlias(alias)) seeds.add(alias)
    }
  }
  return [...seeds].slice(0, MAX_COMPANY_SEEDS)
}

/**
 * 날짜 기반 회전 — seed 전량이 1회차 시간 예산(COMPANY_SEARCH_BUDGET_MS)을 넘으면
 * 매일 시작 지점을 옮겨 장기적으로 전체 seed 가 고르게 커버되게 한다.
 */
function rotateSeedsForToday(seeds: string[]): string[] {
  if (seeds.length === 0) return seeds
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  const offset = dayIndex % seeds.length
  return [...seeds.slice(offset), ...seeds.slice(0, offset)]
}

/**
 * 회사명 타깃 뉴스 수집(259) — curated_companies(253)의 name+aliases 를 Google News RSS
 * 검색 seed 로 사용, crawlKeywordSearch 와 동일 파이프라인(processCrawlItem)을 재사용한다.
 * - 니치 회사(기사 자체가 드묾)의 코퍼스를 채워 254/258 회사 인사이트 생성이 기사를 확보하게 한다.
 * - budgetMs 초과 시 남은 seed 는 건너뜀 — 크래시 없음, 다음 회차에 rotateSeedsForToday 로 이어감.
 * - 이 phase 도 seed 순차(for-of) 처리 — seed 가 더 늘면(현재 MAX_COMPANY_SEEDS=120) 병렬화 검토
 *   (2026-07-12 §5 재검증. 지금은 budgetMs 자체 상한 + rotateSeedsForToday 회전으로 버팀).
 */
async function crawlCompanySearch(
  admin: SupabaseClient,
  seeds: string[],
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  aliasMap: Map<string, string>,
  issueList: IssueMatchDef[],
  exclusionRules: ExclusionRule[],
  exclusionHits: Map<string, number>,
  minBodyLength: number,
  budgetMs: number,
  overallDeadline?: number
): Promise<{ counts: CrawlCounts; hadError: boolean; processedSeeds: number; firstError?: string }> {
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0, rejectedBy: zeroRejectedBy() }
  let hadError = false
  let processedSeeds = 0
  let firstError: string | undefined
  // 이 phase 자체 예산(budgetMs)과 크롤 전체 소프트 데드라인 중 먼저 오는 쪽을 따른다.
  const deadline = overallDeadline !== undefined
    ? Math.min(Date.now() + budgetMs, overallDeadline)
    : Date.now() + budgetMs
  const since = getDaysAgoStartKst(KEYWORD_LOOKBACK_DAYS)
  const adapter = getAdapter('news_site')!
  const srcCtx: ItemSourceCtx = { id: null, type: 'news_site', trust_tier: 1, isSearchSourced: true }

  for (const seed of seeds) {
    if (Date.now() >= deadline) break
    try {
      // news-site 어댑터 재사용: rss_url 만 실제로 사용됨
      const syntheticSource = {
        rss_url: googleNewsRss(seed),
        name: `Google News(회사): ${seed}`,
      } as unknown as Source

      const rawItems = await withRetry(
        () => adapter.fetch(syntheticSource, since),
        3,
        [500, 1000, 2000]
      )
      counts.fetched += rawItems.length
      processedSeeds++

      for (const item of rawItems) {
        const result = await processCrawlItem(
          admin, item, srcCtx, keywords, groups, translationBudget, classifyBudget, counts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
        )
        if (result.partial) {
          hadError = true
          if (!firstError) firstError = `seed "${seed}": ${result.errorMessage ?? '아이템 처리 실패'}`
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[크롤러] 회사 seed 검색 오류 (seed: "${seed}"):`, message)
      hadError = true
      if (!firstError) firstError = `seed "${seed}": ${message}`
    }
  }

  return { counts, hadError, processedSeeds, firstError }
}

/** keyword_groups DB 행 — 게이트·태깅·시그널용 */
interface KeywordGroupRow {
  name: string
  include_patterns: string[]
  exclude_patterns: string[]
  weight: number
  signal_hint: string | null
}

/** enrichment 대상 행 타입 */
interface EnrichRow {
  id: string
  original_url: string
  body_original: string | null
  status: string | null
  review_reason: string | null
  source_id: string | null
  matched_groups: string[] | null
  body_retry_count: number | null
}

// 본문이 개선됐을 때만 재판정 대상으로 삼는 review_reason — low_relevance/llm_irrelevant/
// excluded_rule은 본문과 무관한 판정이라 여기서 절대 건드리지 않는다.
const BODY_REVIEW_REASONS = new Set(['body_short', 'body_missing', 'body_truncated', 'extract_failed'])

/**
 * 교차중복 클러스터 병합(196) — canonical(해소된 원문 URL)이 같은 기존 행이 있으면
 * cluster_id 로 묶는다(342 near-dup 대표 승격 패턴 재사용). 데이터 삭제 없음, cluster_id 만 세팅.
 * canonical_url 컬럼 없음(42703) 등은 조용히 skip(호출부에서 이미 canonical 저장 성공 후에만 호출).
 */
export async function mergeByCanonical(admin: SupabaseClient, rowId: string, canonical: string): Promise<boolean> {
  const byCanonical = await admin
    .from('contents')
    .select('id, cluster_id')
    .eq('canonical_url', canonical)
    .neq('id', rowId)
    .order('collected_at', { ascending: true })
    .limit(1)

  if (byCanonical.error) return false

  let found = byCanonical.data?.[0] as { id: string; cluster_id: string | null } | undefined

  if (!found) {
    const byOriginal = await admin
      .from('contents')
      .select('id, cluster_id')
      .eq('original_url', canonical)
      .neq('id', rowId)
      .order('collected_at', { ascending: true })
      .limit(1)
    found = byOriginal.data?.[0] as { id: string; cluster_id: string | null } | undefined
  }

  if (!found) return false

  const repId = found.cluster_id ?? found.id
  if (!found.cluster_id) {
    await admin.from('contents').update({ cluster_id: repId }).eq('id', found.id)
  }
  await admin.from('contents').update({ cluster_id: repId }).eq('id', rowId)
  return true
}

/**
 * 이번 수집 런에서 신규 적재된 콘텐츠의 풀본문을 best-effort 로 추출한다.
 * - body_fetched_at IS NULL + original_url 있음 + 이번 런 이후 수집분만 대상.
 * - 추출 성공 시 body_original 갱신. 요약(summary_ko)은 여기서 만들지 않음 —
 *   /api/cron/summary-backfill 이 이 결과(개선된 본문)를 그대로 읽어 채운다.
 * - 실패·타임아웃은 441 재시도 정책(markBodyRetryOrGiveUp)으로 처리 — 상한(4회) 전까지는
 *   백오프 재시도, 상한 도달 시에만 body_fetched_at 영구 마킹. 크롤 결과는 그대로 보존.
 */
async function enrichRecentContents(
  admin: SupabaseClient,
  runStartedAt: string,
  deadline?: number,
  keywordGroupCount = 0
): Promise<void> {
  try {
    const { data: rows, error } = await admin
      .from('contents')
      .select('id, original_url, body_original, status, review_reason, source_id, matched_groups, body_retry_count')
      .is('body_fetched_at', null)
      .not('original_url', 'is', null)
      .gte('collected_at', runStartedAt)
      .order('collected_at', { ascending: false })
      .limit(MAX_ENRICH_PER_CRAWL)

    if (error) {
      console.error('[보강] 대상 조회 실패:', error.message)
      return
    }
    if (!rows?.length) return

    const sourceIds = [...new Set((rows as EnrichRow[]).map(row => row.source_id).filter((id): id is string => Boolean(id)))]
    const sourceMap = new Map<string, { trust_tier: number; type: string }>()
    if (sourceIds.length) {
      const { data: sources, error: sourceError } = await admin
        .from('sources').select('id, trust_tier, type').in('id', sourceIds)
      if (sourceError) console.warn('[보강] 소스 관련도 정보 조회 실패:', sourceError.message)
      for (const source of sources ?? []) sourceMap.set(source.id, source)
    }

    console.log(`[보강] 풀본문 추출 대상: ${rows.length}건`)

    for (const row of rows as EnrichRow[]) {
      if (deadline !== undefined && Date.now() >= deadline) {
        // 소프트 데드라인 초과 — 남은 행은 body_fetched_at 이 여전히 null 이라 다음 크롤에서 재시도됨.
        break
      }
      try {
        const resolved = await resolveArticleUrl(row.original_url)

        // canonical URL 저장 + 교차중복 병합(196) — 추가 fetch 0(위 resolved 재사용). 실패해도 본문 추출 흐름 무중단.
        try {
          const canonical = normalizeUrl(resolved)
          const { error: canonError } = await admin
            .from('contents')
            .update({ canonical_url: canonical })
            .eq('id', row.id)
          if (!canonError) {
            await mergeByCanonical(admin, row.id, canonical)
          } else if (canonError.code !== '42703') {
            console.warn('[보강] canonical_url 갱신 실패 (id:', row.id, '):', canonError.message)
          }
        } catch (e) {
          console.warn('[보강] canonical 처리 오류 (id:', row.id, '):', e)
        }

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
          extracted &&
          extracted.length > existingBody.length &&
          extracted.length >= ENRICH_MIN_BODY_LEN

        if (improved && extracted) {
          const update: Record<string, unknown> = {
            body_original: extracted,
            body_fetched_at: new Date().toISOString(),
          }

          // 본문이 개선돼 품질 게이트를 통과하고, 갇힌 사유가 본문 계열이었을 때만 재판정해 발행
          // (실측 버그, 2026-07-13: 보강으로 풀본문을 확보해도 status가 그대로 pending에 갇힘).
          if (
            row.review_reason &&
            BODY_REVIEW_REASONS.has(row.review_reason) &&
            assessBodyQuality(extracted, { minLen: SUMMARY_MIN_BODY_LEN }) === null
          ) {
            const source = row.source_id ? sourceMap.get(row.source_id) : undefined
            const relevancePass =
              (row.matched_groups?.length ?? 0) > 0 ||
              keywordGroupCount === 0 ||
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
        } else {
          // 441 — 추출 실패 또는 스니펫이 더 길면: 재시도 상한 전까지는 백오프 재시도,
          // 상한 도달 시에만 영구 마킹(enrich-body.ts와 동일 정책 공유).
          await markBodyRetryOrGiveUp(admin, row.id, row.body_retry_count ?? 0)
        }
      } catch (e) {
        console.error('[보강] 아이템 enrichment 오류 (id:', row.id, '):', e)
      }
    }
  } catch (e) {
    console.error('[보강] enrichRecentContents 오류:', e)
  }
}

/** 전체 크롤 실행 — Orchestrator 진입점
 *  @param options.backfillDays 소급 수집 일수(1~30). 미지정/0 이면 당일(KST 0시 이후)만.
 *  @param options.force true 이면 주기와 관계없이 활성 소스를 모두 실행.
 *  @param options.sourceIds 지정 시 해당 소스만 수집, 키워드 검색 skip. */
export async function runCrawl(options: RunCrawlOptions = {}): Promise<CrawlSummary> {
  const runStartedAt = new Date().toISOString()
  const softDeadline = Date.now() + CRAWL_SOFT_DEADLINE_MS
  const backfillDays =
    options.backfillDays && options.backfillDays > 0
      ? Math.min(Math.floor(options.backfillDays), 30)
      : 0
  const since = backfillDays > 0 ? getDaysAgoStartKst(backfillDays) : getTodayStartKst()

  let admin: SupabaseClient
  let rawSources: Source[]
  let keywords: CrawlKeyword[]
  let groups: ScoringGroup[]
  let searchSeeds: string[] = []

  try {
    admin = createAdminClient()
    const [sourcesResult, keywordsResult, groupsResult] = await Promise.all([
      admin.from('sources').select('*').eq('is_active', true),
      admin.from('keywords').select('id, name, service_id'),
      admin.from('keyword_groups')
        .select('name, include_patterns, exclude_patterns, weight, signal_hint')
        .eq('is_active', true),
    ])

    if (sourcesResult.error) throw sourcesResult.error
    if (keywordsResult.error) throw keywordsResult.error
    if (groupsResult.error) throw groupsResult.error

    rawSources = (sourcesResult.data ?? []) as Source[]
    keywords = (keywordsResult.data ?? []) as CrawlKeyword[]

    const allGroupData = (groupsResult.data ?? []) as KeywordGroupRow[]
    groups = allGroupData.map(r => ({
      name: r.name,
      include_patterns: r.include_patterns,
      exclude_patterns: r.exclude_patterns,
      weight: r.weight,
      signal_hint: r.signal_hint ?? null,
    }))

    // search_seeds 별도 쿼리 — SQL 56 적용 전엔 컬럼이 없어 에러 날 수 있으므로 throw 금지
    const seedsResult = await admin
      .from('keyword_groups')
      .select('search_seeds')
      .eq('is_active', true)
    if (!seedsResult.error && seedsResult.data) {
      searchSeeds = [
        ...new Set(
          (seedsResult.data as { search_seeds: string[] }[])
            .flatMap(r => r.search_seeds ?? [])
        ),
      ].slice(0, MAX_SEARCH_SEEDS)
    } else if (seedsResult.error) {
      console.warn('[크롤러] search_seeds 조회 실패 (SQL 56 미적용), 키워드 검색 skip:', seedsResult.error.message)
    }
  } catch (error) {
    console.error('[크롤러] 수집 준비 단계 오류:', error)
    throw new Error('수집 준비 중 오류가 발생했습니다. 서버 설정을 확인해주세요.')
  }

  // 엔티티 alias 맵 로드 — SQL 99 미적용 시 빈 맵으로 격리(크롤 무중단)
  const aliasMap = new Map<string, string>() // lower(alias) → entity_id
  try {
    const aliasResult = await admin
      .from('entity_aliases')
      .select('alias, entity_id')
      .limit(5000)
    if (aliasResult.error) {
      console.warn('[크롤러] entity_aliases 조회 실패 (SQL 99 미적용 가능), 링킹 skip:', aliasResult.error.message)
    } else {
      for (const row of (aliasResult.data ?? []) as { alias: string; entity_id: string }[]) {
        aliasMap.set(row.alias.toLowerCase(), row.entity_id)
      }
    }
  } catch (e) {
    console.warn('[크롤러] entity_aliases 로드 실패, 링킹 skip:', e)
  }

  // 이슈 목록 로드 — SQL 101 미적용 시 빈 배열로 격리(크롤 무중단)
  const issueList: IssueMatchDef[] = []
  try {
    const issueResult = await admin
      .from('issues')
      .select('id, match_keywords')
      .eq('status', 'published')
    if (issueResult.error) {
      console.warn('[크롤러] issues 조회 실패 (SQL 101 미적용 가능), 배정 skip:', issueResult.error.message)
    } else {
      for (const row of (issueResult.data ?? []) as { id: string; match_keywords: string[] }[]) {
        issueList.push({ id: row.id, match_keywords: row.match_keywords })
      }
    }
  } catch (e) {
    console.warn('[크롤러] issues 로드 실패, 배정 skip:', e)
  }

  // 제외 규칙(190) 로드 — SQL 미적용(42P01) 시 빈 배열로 격리(크롤 무중단, 기존 동작 유지)
  const exclusionRules: ExclusionRule[] = []
  try {
    const exclusionResult = await admin
      .from('exclusion_rules')
      .select('id, rule_type, value, action, is_active')
      .eq('is_active', true)
    if (exclusionResult.error) {
      console.warn('[크롤러] exclusion_rules 조회 실패 (SQL 190 미적용 가능), 제외 규칙 skip:', exclusionResult.error.message)
    } else {
      exclusionRules.push(...(exclusionResult.data ?? []) as ExclusionRule[])
    }
  } catch (e) {
    console.warn('[크롤러] exclusion_rules 로드 실패, 제외 규칙 skip:', e)
  }

  // 제외 규칙 hit 집계(194) — 런 단위 누적, 종료 후 배치 flush(아이템별 write 없음)
  const exclusionHits = new Map<string, number>()

  // 회사 seed 목록(259) — curated_companies(253) 기반, SQL 미적용(42P01) 시 빈 배열로 격리(크롤 무중단)
  let companySeeds: string[] = []
  try {
    const companyResult = await admin
      .from('curated_companies')
      .select('name, aliases')
      .eq('is_active', true)
    if (companyResult.error) {
      console.warn('[크롤러] curated_companies 조회 실패 (SQL 253 미적용 가능), 회사 seed 검색 skip:', companyResult.error.message)
    } else {
      companySeeds = rotateSeedsForToday(
        buildCompanySeeds((companyResult.data ?? []) as CuratedCompanyRow[])
      )
    }
  } catch (e) {
    console.warn('[크롤러] curated_companies 로드 실패, 회사 seed 검색 skip:', e)
  }

  // 본문 최소 길이(221) — crawl_settings 단일행, SQL 미적용(42P01) 시 기본값으로 격리(크롤 무중단)
  let minBodyLength = DEFAULT_MIN_BODY_LENGTH
  try {
    const settingsResult = await admin
      .from('crawl_settings')
      .select('min_body_length')
      .eq('id', true)
      .maybeSingle()
    if (settingsResult.error) {
      console.warn('[크롤러] crawl_settings 조회 실패 (SQL 221 미적용 가능), 기본값 사용:', settingsResult.error.message)
    } else if (settingsResult.data?.min_body_length != null) {
      minBodyLength = settingsResult.data.min_body_length
    }
  } catch (e) {
    console.warn('[크롤러] crawl_settings 로드 실패, 기본값 사용:', e)
  }

  const translationBudget: TranslationBudget = {
    remaining: MAX_TRANSLATIONS_PER_CRAWL,
  }
  const classifyBudget: TranslationBudget = {
    remaining: MAX_LLM_CLASSIFY_PER_CRAWL,
  }
  const transcriptBudget: TranslationBudget = {
    remaining: MAX_TRANSCRIPTS_PER_CRAWL,
  }
  const providers: CrawlProviderCounts = {
    keyword_google: 0,
    keyword_naver: 0,
    keyword_gdelt: 0,
    company_google: 0,
    keyword_phase_skipped: true,
  }

  const scoped = options.sourceIds?.length
    ? rawSources.filter(s => options.sourceIds!.includes(s.id))
    : rawSources

  const dueSources = selectCrawlSources(
    scoped,
    { backfillDays, force: options.force }
  )

  // GDELT BigQuery 소급 경로: 기존 아이템 처리 파이프라인을 그대로 재사용한다.
  if (options.gdeltBackfill) {
    if (!hasGdeltCredentials()) return { ok: true, sources_total: 0, success: 0, failed: 0, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, held: 0, details: [], providers, error: undefined }
    const terms = [...new Set([...keywords.map(k => k.name), ...searchSeeds, ...groups.flatMap(g => g.include_patterns ?? [])])]
    const discovered = await queryGdeltMonth({ ...options.gdeltBackfill, keywordTerms: terms })
    const counts = zeroRejectedBy()
    const itemCounts = { fetched: discovered.length, inserted: 0, duplicate: 0, rejected: 0, held: 0, rejectedBy: counts }
    for (const item of discovered) {
      const result = await processCrawlItem(admin, { original_url: item.url, title: `GDELT 수집 기사 ${item.domain}`, body: `GDELT 원문 링크 ${item.url}`, published_at: item.date }, { id: null, type: 'news_site', trust_tier: 1, isSearchSourced: true }, keywords, groups, translationBudget, classifyBudget, itemCounts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength)
      if (result.errorMessage) console.warn('[GDELT 백필] 아이템 처리 실패:', result.errorMessage)
    }
    await enrichRecentContents(admin, runStartedAt, softDeadline, groups.length)
    return { ok: true, sources_total: 1, success: 1, failed: 0, fetched: itemCounts.fetched, inserted: itemCounts.inserted, duplicates: itemCounts.duplicate, rejected: itemCounts.rejected, held: itemCounts.held, details: [{ source: 'GDELT BigQuery', status: 'success', fetched: itemCounts.fetched, inserted: itemCounts.inserted, duplicate: itemCounts.duplicate, rejected: itemCounts.rejected }], providers }
  }

  // 소스별 격리 실행 — 1개 실패가 전체를 멈추지 않음
  // youtube_channel → crawlYoutube, 그 외(news_site 등) → crawlOne
  // 각 소스에 softDeadline 전달 — 이전엔 이 구간이 무제한이라(회사/키워드 seed 검색과 달리
  // 데드라인 체크가 없었음) backfillDays 로 아이템 수가 늘면 maxDuration 하드킬까지 갈 수
  // 있었다(job_runs 가 running 에서 멈추는 근본 원인, 2026-07-27 조사).
  const results = await Promise.allSettled(
    dueSources.map(s =>
      s.type === 'youtube_channel'
        ? crawlYoutube(admin, s, groups, aliasMap, transcriptBudget, softDeadline)
        : crawlOne(
            admin,
            s,
            sinceForSource(s, since, backfillDays),
            keywords,
            groups,
            translationBudget,
            classifyBudget,
            aliasMap,
            issueList,
            exclusionRules,
            exclusionHits,
            minBodyLength,
            softDeadline
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

  // 키워드 검색 수집 — 개별 소스 수집(sourceIds 지정) 시 skip
  if (!options.sourceIds?.length && searchSeeds.length > 0) {
    providers.keyword_phase_skipped = false
    console.log(`[크롤러] 키워드 검색 수집 시작: ${searchSeeds.length}개 시드`)
    const kwResult = await crawlKeywordSearch(
      admin, searchSeeds, keywords, groups, translationBudget, classifyBudget, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength, softDeadline
    )
    if (kwResult.truncated) console.warn('[크롤러] 키워드 검색 소프트 데드라인 초과 — 일부 seed 건너뜀')
    providers.keyword_google = kwResult.providerFetched.google
    providers.keyword_naver = kwResult.providerFetched.naver
    providers.keyword_gdelt = kwResult.providerFetched.gdelt
    totalFetched    += kwResult.counts.fetched
    totalInserted   += kwResult.counts.inserted
    totalDuplicates += kwResult.counts.duplicate
    totalRejected   += kwResult.counts.rejected
    totalHeld       += kwResult.counts.held
    details.push({
      source:    'Google News 키워드',
      status:    kwResult.hadError ? 'partial' : 'success',
      fetched:   kwResult.counts.fetched,
      inserted:  kwResult.counts.inserted,
      duplicate: kwResult.counts.duplicate,
      rejected:  kwResult.counts.rejected,
      error:     kwResult.firstError,
    })
    if (!kwResult.hadError) successCount++
  }

  // 회사 seed 수집(259) — curated_companies(253) 니치 회사 코퍼스 확보. 개별 소스 수집(sourceIds 지정) 시 skip.
  if (!options.sourceIds?.length && companySeeds.length > 0) {
    console.log(`[크롤러] 회사 seed 수집 시작: ${companySeeds.length}개 시드(날짜 회전 적용)`)
    const companyResult = await crawlCompanySearch(
      admin, companySeeds, keywords, groups, translationBudget, classifyBudget, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength, COMPANY_SEARCH_BUDGET_MS, softDeadline
    )
    providers.company_google = companyResult.counts.fetched
    totalFetched    += companyResult.counts.fetched
    totalInserted   += companyResult.counts.inserted
    totalDuplicates += companyResult.counts.duplicate
    totalRejected   += companyResult.counts.rejected
    totalHeld       += companyResult.counts.held
    details.push({
      source:    'Google News 회사 seed',
      status:    companyResult.hadError ? 'partial' : 'success',
      fetched:   companyResult.counts.fetched,
      inserted:  companyResult.counts.inserted,
      duplicate: companyResult.counts.duplicate,
      rejected:  companyResult.counts.rejected,
      error:     companyResult.firstError,
    })
    if (!companyResult.hadError) successCount++
    console.log(`[크롤러] 회사 seed 수집 완료: ${companyResult.processedSeeds}/${companySeeds.length}개 시드 처리`)
  }

  // 제외 규칙 hit 배치 flush(194) — 런당 1콜, SQL 미적용(RPC 없음) 시 graceful skip
  if (exclusionHits.size > 0) {
    try {
      const { error } = await admin.rpc('increment_exclusion_hits', {
        hits: Object.fromEntries(exclusionHits),
      })
      if (error) console.warn('[크롤러] exclusion hit 집계 skip (194 SQL 미적용 가능):', error.message)
    } catch (e) {
      console.warn('[크롤러] exclusion hit 집계 실패:', e)
    }
  }

  // enrichment tail — 신규 적재분 풀본문 추출 (실패해도 크롤 결과 보존)
  await enrichRecentContents(admin, runStartedAt, softDeadline, groups.length)

  // 실패 사유를 job_runs 에 구체적으로 남기기 위한 집계.
  // status !== 'success' 이면서 error 가 있는 항목(소스/키워드 검색/회사 seed 검색 전부 포함)만 뽑아
  // "어느 소스가 왜" 실패했는지 한 문장으로 요약한다. 각 사유는 200자로 잘라 error 컬럼 폭주 방지.
  const problemDetails = details.filter(d => d.status !== 'success' && d.error)
  const errorSummary = problemDetails.length > 0
    ? `${problemDetails.length}/${details.length}개 소스 이슈: ` +
      problemDetails
        .map(d => `${d.source}[${d.status}](${(d.error ?? '').slice(0, 200)})`)
        .join('; ')
        .slice(0, 1800)
    : undefined

  // "소스 1개만 실패해도 전체 failed" 는 과했음(07-22 사고 조사).
  // 시도한 것(개별 소스 + 키워드/회사 seed 검색)이 하나라도 성공했으면 부분 실패로 보고 전체는
  // 성공 처리하되, errorSummary 를 남겨 job_runs.meta 로 경고를 추적할 수 있게 한다.
  // 전부 실패했을 때(성공 0건)만 진짜 전체 실패로 판정한다.
  const attemptedAnything =
    dueSources.length > 0 || searchSeeds.length > 0 || companySeeds.length > 0
  const ok = !attemptedAnything || successCount > 0

  if (!ok) {
    console.error(`[크롤러] 크롤 전체 실패 — ${errorSummary ?? '성공한 소스 없음(사유 미상)'}`)
  } else if (problemDetails.length > 0) {
    console.warn(`[크롤러] 부분 실패 있었으나 전체는 성공 처리 — ${errorSummary}`)
  }

  return {
    ok,
    sources_total: dueSources.length,
    success: successCount,
    failed: failedCount,
    fetched: totalFetched,
    inserted: totalInserted,
    duplicates: totalDuplicates,
    rejected: totalRejected,
    held: totalHeld,
    details,
    providers,
    error: errorSummary,
  }
}
