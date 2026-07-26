import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterOutStockContent } from '@/lib/newsletter/content-filter'
import { generateCardInsights } from '@/lib/newsletter/card-insights'
import {
  getDailyInsightTeaser,
  getKnowledgeReportTeasers,
  getCompanyTrendLines,
  type DailyInsightTeaser,
  type KnowledgeReportTeaser,
  type CompanyTrendLine,
} from '@/lib/newsletter/teasers'
import {
  NEWS_GROUP_DEFS,
  loadCompetitorNameSets,
  pickResidualMarketCandidates,
  AI_BIGTECH_GROUPS_LIST,
  AIDC_INFRA_GROUPS_LIST,
  POLICY_GROUPS_LIST,
  type NewsGroupKey,
  type CompetitorNameSets,
} from '@/lib/newsletter/news-groups'

export interface PreparedCard {
  id: string
  title: string
  category: string
  sourceName: string | null
  summaryKo: string | null
  originalUrl: string | null
  detailUrl: string
  insight: string | null
}

export interface PreparedNewsGroup {
  key: NewsGroupKey
  label: string
  cards: PreparedCard[]
}

export interface PreparedNewsletterIssue {
  /** 5분류 그룹 구조(§2) — 템플릿·payload 저장은 이 구조를 기준으로 한다. */
  newsGroups: PreparedNewsGroup[]
  dailyInsight: DailyInsightTeaser | null
  knowledgeReports: KnowledgeReportTeaser[]
  companyTrends: CompanyTrendLine[]
}

interface RawContentRow {
  id: string
  title: string
  category: string
  summary_ko: string | null
  original_url: string | null
  matched_groups: string[] | null
  matched_keywords: string[] | null
  sources: { name: string } | { name: string }[] | null
}

function extractSourceName(src: RawContentRow['sources']): string | null {
  if (Array.isArray(src)) return src[0]?.name ?? null
  return src?.name ?? null
}

const CONTENT_SELECT = 'id, title, category, summary_ko, original_url, matched_groups, matched_keywords, sources(name)'

/** 카테고리(§2)당 최대 노출 건수. */
const MAX_CARDS_PER_GROUP = 2
/** 버킷별 전용 조회 시 후보 여유분(주식 필터로 일부 걸러질 것을 감안). */
const PER_BUCKET_FETCH_LIMIT = 15
/** ⑤ 시장·B2B동향(잔여) 판정용 일반 후보 풀 크기. */
const RESIDUAL_POOL_LIMIT = 40

interface OverlapFilter {
  column: 'matched_groups' | 'matched_keywords'
  values: string[]
}

/**
 * 발행일·조회수 순으로 정렬된 후보를 조회한다. 버킷 ①~④는 overlaps 필터를 얹어
 * "그 카테고리 안에서 상위권"인 기사를 직접 뽑는다 — 하나의 공통 풀에서 나눠 담으면 조회수
 * 상위권을 AI 일반 기사가 독식해 특정 버킷이 늘 비어버리는 문제(실측 확인)를 피하기 위함이다.
 * overlaps 대상 배열이 비어 있으면(엔티티 조회 실패 등) 조회 자체를 건너뛴다.
 */
async function queryTopContents(supabase: SupabaseClient, overlap: OverlapFilter | null, limit: number): Promise<RawContentRow[]> {
  if (overlap && overlap.values.length === 0) return []

  let query = supabase.from('contents').select(CONTENT_SELECT).eq('status', 'published')
  if (overlap) query = query.overlaps(overlap.column, overlap.values)

  const { data, error } = await query
    .order('is_editor_pick', { ascending: false })
    .order('view_count', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('[뉴스레터/카드선정] 콘텐츠 조회 실패:', error.message)
    return []
  }
  return (data ?? []) as unknown as RawContentRow[]
}

function stockFilter(rows: RawContentRow[]): RawContentRow[] {
  const { kept } = filterOutStockContent(
    rows.map((r) => ({ id: r.id, title: r.title, category: r.category, summary_ko: r.summary_ko }))
  )
  const keptIds = new Set(kept.map((k) => k.id))
  return rows.filter((r) => keptIds.has(r.id))
}

/** 버킷 ①~④ 후보를 각각의 DB 필터로 직접 조회(주식 필터·상한 적용)한다. */
async function fetchGroupBuckets(
  supabase: SupabaseClient,
  names: CompetitorNameSets
): Promise<{ buckets: Record<Exclude<NewsGroupKey, 'market_b2b'>, RawContentRow[]>; usedIds: Set<string> }> {
  const [competitorRows, aiRows, aidcGroupRows, aidcCloudRows, policyRows] = await Promise.all([
    queryTopContents(supabase, { column: 'matched_keywords', values: Array.from(names.telco) }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: AI_BIGTECH_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: AIDC_INFRA_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_keywords', values: Array.from(names.cloud) }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: POLICY_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
  ])

  const usedIds = new Set<string>()
  const dedupeAgainstUsed = (rows: RawContentRow[]): RawContentRow[] => {
    const result = rows.filter((r) => !usedIds.has(r.id)).slice(0, MAX_CARDS_PER_GROUP)
    result.forEach((r) => usedIds.add(r.id))
    return result
  }

  // AIDC·인프라는 두 조회(키워드그룹 매치 + 클라우드 경쟁사 언급)를 순위 유지한 채 병합.
  const aidcMerged: RawContentRow[] = []
  const aidcSeen = new Set<string>()
  for (const r of [...aidcGroupRows, ...aidcCloudRows]) {
    if (aidcSeen.has(r.id)) continue
    aidcSeen.add(r.id)
    aidcMerged.push(r)
  }

  return {
    buckets: {
      competitor: dedupeAgainstUsed(stockFilter(competitorRows)),
      ai_bigtech: dedupeAgainstUsed(stockFilter(aiRows)),
      aidc_infra: dedupeAgainstUsed(stockFilter(aidcMerged)),
      policy: dedupeAgainstUsed(stockFilter(policyRows)),
    },
    usedIds,
  }
}

/**
 * 카드 선정(주식 필터 적용 → 5카테고리 분류, §2) → 카드별 인사이트 배치 생성(1콜) →
 * 티저 3종 조회를 한 번에 처리한다. cron/manual 발송과 관리자 미리보기가 공유하는 단일 지점.
 *
 * generateInsights=false 로 호출하면 LLM 호출 없이 카드/티저만 반환한다(가벼운 미리보기용).
 */
export async function prepareNewsletterIssue(
  supabase: SupabaseClient,
  { baseUrl, generateInsights = true }: { cardCount: number; baseUrl: string; generateInsights?: boolean }
): Promise<PreparedNewsletterIssue> {
  const competitorNames = await loadCompetitorNameSets(supabase)
  const { buckets, usedIds } = await fetchGroupBuckets(supabase, competitorNames)

  // ⑤ 시장·B2B동향 — 넓은 일반 후보 풀에서 ①~④ 어디에도 속하지 않는(=진짜 잔여) 기사만 채운다.
  const residualPool = stockFilter(await queryTopContents(supabase, null, RESIDUAL_POOL_LIMIT))
  const marketRows = pickResidualMarketCandidates(
    residualPool.map((r) => ({ ...r, matchedGroups: r.matched_groups ?? [], matchedKeywords: r.matched_keywords ?? [] })),
    competitorNames,
    usedIds,
    MAX_CARDS_PER_GROUP
  )

  const bucketsWithMarket: Record<NewsGroupKey, RawContentRow[]> = { ...buckets, market_b2b: marketRows }
  const selected = NEWS_GROUP_DEFS.flatMap((def) => bucketsWithMarket[def.key])

  const insights = generateInsights
    ? await generateCardInsights(selected.map((r) => ({ id: r.id, title: r.title, summaryKo: r.summary_ko })))
    : new Map<string, string>()

  const toCard = (r: RawContentRow): PreparedCard => ({
    id: r.id,
    title: r.title,
    category: r.category,
    sourceName: extractSourceName(r.sources),
    summaryKo: r.summary_ko,
    originalUrl: r.original_url,
    detailUrl: `${baseUrl}/dashboard/contents/${r.id}`,
    insight: insights.get(r.id) ?? null,
  })

  const newsGroups: PreparedNewsGroup[] = NEWS_GROUP_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    cards: bucketsWithMarket[def.key].map(toCard),
  }))

  const relatedGroups = Array.from(new Set(selected.flatMap((r) => r.matched_groups ?? [])))

  const [dailyInsight, knowledgeReports, companyTrends] = await Promise.all([
    getDailyInsightTeaser(supabase, baseUrl),
    getKnowledgeReportTeasers(supabase, baseUrl, relatedGroups),
    getCompanyTrendLines(supabase),
  ])

  return { newsGroups, dailyInsight, knowledgeReports, companyTrends }
}
