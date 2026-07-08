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
import type { ContentCategory, Source, SourceType } from '@/lib/types'
import {
  selectCrawlSources,
  type CrawlScheduleOptions,
} from '@/lib/crawler/schedule'
import {
  TRANSLATION_SEPARATOR,
  translateToKorean,
} from '@/lib/translate'
import { summarizeKo } from './summarize'
import { classifyRelevance } from './classify'
import { extract } from '@extractus/article-extractor'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { resolveArticleUrl } from './resolve-url'

const MAX_TRANSLATIONS_PER_CRAWL = 20
const MAX_SUMMARIES_PER_CRAWL = 60
const SUMMARY_MIN_BODY_LEN = 200
const MAX_LLM_CLASSIFY_PER_CRAWL = 40
const RELATEDNESS_MARGIN = 0.15
const MAX_MERGED_TAGS = 8
const OPINION_LOOKBACK_DAYS = 7

// enrichment(풀본문 보강) 상수
const MAX_ENRICH_PER_CRAWL = 30
const ENRICH_MIN_BODY_LEN = 400

// ── 키워드 검색 수집 상수 ────────────────────────────────────────────────
const KEYWORD_LOOKBACK_DAYS = 2
const MAX_SEARCH_SEEDS = 30
const googleNewsRss = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`

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

/**
 * 아이템 처리에 필요한 소스 컨텍스트 (소스 등록 없는 경우 id=null 허용).
 */
interface ItemSourceCtx {
  id: string | null
  type: SourceType
  trust_tier: number
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
  summarizeBudget: TranslationBudget,
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
    if (
      isAdLike(qText) ||
      isExcludedByGroups(item.title, groups) ||  // keyword_groups.exclude_patterns 기반
      effectiveLength(item.title, item.body ?? null) < MIN_EFFECTIVE_LENGTH ||
      bodyLength(item.body ?? null) < minBodyLength ||  // 221 — 본문 최소 길이(어드민 설정, 기본 250)
      exclusionMatch?.action === 'reject'
    ) {
      counts.rejected++
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

        // post-insert: 한국어 요약 (B3-1) — published·본문충분·예산 조건
        if (contentStatus === 'published' && summarizeBudget.remaining > 0) {
          const bodyKo = translatedContent?.body ?? item.body ?? ''
          if (bodyKo.length >= SUMMARY_MIN_BODY_LEN) {
            summarizeBudget.remaining--
            try {
              const summary = await summarizeKo(row.title, bodyKo)
              if (summary) {
                const { error: sumErr } = await admin
                  .from('contents')
                  .update({ summary_ko: summary })
                  .eq('id', newId)
                if (sumErr) console.error('[크롤러] 요약 적재 실패:', sumErr.message)
              }
            } catch (e) {
              console.error('[크롤러] 요약 생성 실패:', e)
            }
          }
        }
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
  summarizeBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  aliasMap: Map<string, string> = new Map(),
  issueList: IssueMatchDef[] = [],
  exclusionRules: ExclusionRule[] = [],
  exclusionHits: Map<string, number> = new Map(),
  minBodyLength: number = DEFAULT_MIN_BODY_LENGTH
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

    const srcCtx: ItemSourceCtx = {
      id: source.id,
      type: source.type,
      trust_tier: source.trust_tier,
    }

    for (const item of rawItems) {
      const result = await processCrawlItem(
        admin, item, srcCtx, keywords, groups, translationBudget, summarizeBudget, classifyBudget, counts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
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
        // contents 테이블에도 mirror insert (어드민 콘텐츠 관리 통합)
        const { error: contentMirrorError } = await admin
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
        if (contentMirrorError && contentMirrorError.code !== '23505') {
          console.error(`[크롤러] contents mirror insert 오류 (${item.videoId}):`, contentMirrorError.message)
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
 */
async function crawlKeywordSearch(
  admin: SupabaseClient,
  seeds: string[],
  keywords: CrawlKeyword[],
  groups: ScoringGroup[],
  translationBudget: TranslationBudget,
  summarizeBudget: TranslationBudget,
  classifyBudget: TranslationBudget,
  aliasMap: Map<string, string> = new Map(),
  issueList: IssueMatchDef[] = [],
  exclusionRules: ExclusionRule[] = [],
  exclusionHits: Map<string, number> = new Map(),
  minBodyLength: number = DEFAULT_MIN_BODY_LENGTH
): Promise<{ counts: CrawlCounts; hadError: boolean }> {
  const counts: CrawlCounts = { fetched: 0, inserted: 0, duplicate: 0, held: 0, rejected: 0 }
  let hadError = false
  const since = getDaysAgoStartKst(KEYWORD_LOOKBACK_DAYS)
  const adapter = getAdapter('news_site')!
  const srcCtx: ItemSourceCtx = { id: null, type: 'news_site', trust_tier: 1 }

  for (const seed of seeds) {
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
      counts.fetched += rawItems.length

      for (const item of rawItems) {
        const result = await processCrawlItem(
          admin, item, srcCtx, keywords, groups, translationBudget, summarizeBudget, classifyBudget, counts, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
        )
        if (result.partial) hadError = true
      }
    } catch (err) {
      console.error(
        `[크롤러] 키워드 검색 오류 (seed: "${seed}"):`,
        err instanceof Error ? err.message : String(err)
      )
      hadError = true
    }
  }

  return { counts, hadError }
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
  title: string
  status: string
  original_language: string
  body_translated_ko: string | null
}

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
 * - 추출 성공 시 body_original 갱신 + published 이면 요약 재생성.
 * - 실패·타임아웃이어도 body_fetched_at = now 마킹(재시도 방지) + 크롤 결과 보존.
 */
async function enrichRecentContents(
  admin: SupabaseClient,
  runStartedAt: string,
  summarizeBudget: TranslationBudget
): Promise<void> {
  try {
    const { data: rows, error } = await admin
      .from('contents')
      .select('id, original_url, body_original, title, status, original_language, body_translated_ko')
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

    console.log(`[보강] 풀본문 추출 대상: ${rows.length}건`)

    for (const row of rows as EnrichRow[]) {
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
          await admin
            .from('contents')
            .update({ body_original: extracted, body_fetched_at: new Date().toISOString() })
            .eq('id', row.id)

          // 요약 재생성: published + 예산 있음 + 한국어 본문 확보
          if (row.status === 'published' && summarizeBudget.remaining > 0) {
            const bodyKo =
              row.original_language === 'ko'
                ? extracted
                : (row.body_translated_ko ?? null)
            if (bodyKo && bodyKo.length >= SUMMARY_MIN_BODY_LEN) {
              summarizeBudget.remaining--
              try {
                const summary = await summarizeKo(row.title, bodyKo)
                if (summary) {
                  await admin
                    .from('contents')
                    .update({ summary_ko: summary })
                    .eq('id', row.id)
                }
              } catch (e) {
                console.error('[보강] 요약 재생성 실패 (id:', row.id, '):', e)
              }
            }
          }
        } else {
          // 추출 실패 또는 스니펫이 더 길면 재시도 방지용 마킹
          await admin
            .from('contents')
            .update({ body_fetched_at: new Date().toISOString() })
            .eq('id', row.id)
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
  const summarizeBudget: TranslationBudget = {
    remaining: MAX_SUMMARIES_PER_CRAWL,
  }
  const classifyBudget: TranslationBudget = {
    remaining: MAX_LLM_CLASSIFY_PER_CRAWL,
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
            translationBudget,
            summarizeBudget,
            classifyBudget,
            aliasMap,
            issueList,
            exclusionRules,
            exclusionHits,
            minBodyLength
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
    console.log(`[크롤러] 키워드 검색 수집 시작: ${searchSeeds.length}개 시드`)
    const kwResult = await crawlKeywordSearch(
      admin, searchSeeds, keywords, groups, translationBudget, summarizeBudget, classifyBudget, aliasMap, issueList, exclusionRules, exclusionHits, minBodyLength
    )
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
    })
    if (!kwResult.hadError) successCount++
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

  // enrichment tail — 신규 적재분 풀본문 추출·요약 재생성 (실패해도 크롤 결과 보존)
  await enrichRecentContents(admin, runStartedAt, summarizeBudget)

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
