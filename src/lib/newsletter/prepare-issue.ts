import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterOutStockContent, filterOutYoutubeContent } from '@/lib/newsletter/content-filter'
import { generateCardInsights, type CardInsight } from '@/lib/newsletter/card-insights'
import { fetchRelatedArticles, type RelatedArticle } from '@/lib/newsletter/related-articles'
import { getKstWeekMondayString } from '@/lib/date'
import {
  getKnowledgeReportTeasers,
  type KnowledgeReportTeaser,
} from '@/lib/newsletter/teasers'
import { buildTopTeaserPool, getWeeklyExposure, pickTopTeaser, type TopTeaser } from '@/lib/newsletter/top-teaser'
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
  insight: CardInsight | null
  relatedArticles: RelatedArticle[]
}

export interface PreparedNewsGroup {
  key: NewsGroupKey
  label: string
  cards: PreparedCard[]
}

export interface PreparedNewsletterIssue {
  /** 5분류 그룹 구조(§2) — 템플릿·payload 저장은 이 구조를 기준으로 한다. */
  newsGroups: PreparedNewsGroup[]
  /** 최상단 티저 — 그 주(week_of) 흐름/핵심 인사이트 풀에서 로테이션 선택(§규칙1). 풀 소진 시 null. */
  topTeaser: TopTeaser | null
  knowledgeReports: KnowledgeReportTeaser[]
}

interface RawContentRow {
  id: string
  title: string
  category: string
  summary_ko: string | null
  original_url: string | null
  matched_groups: string[] | null
  matched_keywords: string[] | null
  sources: { name: string; type: string | null } | { name: string; type: string | null }[] | null
}

function extractSourceName(src: RawContentRow['sources']): string | null {
  if (Array.isArray(src)) return src[0]?.name ?? null
  return src?.name ?? null
}

function extractSourceType(src: RawContentRow['sources']): string | null {
  if (Array.isArray(src)) return src[0]?.type ?? null
  return src?.type ?? null
}

const CONTENT_SELECT = 'id, title, category, summary_ko, original_url, matched_groups, matched_keywords, sources(name, type)'

/** 카테고리(§2)당 최종 노출 건수. */
const MAX_CARDS_PER_GROUP = 2
/**
 * 인사이트 생성 단계에 넘기는 그룹당 후보 수(지시서 20260902 §9-5-가). 인사이트가 없는 기사는
 * 카드에서 빠지므로(§9-5), 탈락분을 감안해 MAX_CARDS_PER_GROUP 보다 1건 더 뽑아 인사이트를 만들고,
 * 살아남은 것 중 상위 MAX_CARDS_PER_GROUP 건만 최종 카드로 낸다.
 */
const CANDIDATE_CARDS_PER_GROUP = MAX_CARDS_PER_GROUP + 1
/** 버킷별 전용 조회 시 후보 여유분(유튜브·주식 필터로 일부 걸러질 것을 감안). */
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

  // 요약 백필 큐 지연으로 summary_ko 가 비어있는 기사가 다수라, 뉴스레터 카드는
  // 요약이 준비된 기사만 후보로 삼는다(창작 방지 — 요약 없이 인사이트를 지어내지 않음).
  let query = supabase
    .from('contents')
    .select(CONTENT_SELECT)
    .eq('status', 'published')
    .is('deleted_at', null)
    .not('summary_ko', 'is', null)
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

/**
 * 유튜브 배제(#105) → 주식·증권 배제, 순서 고정. 같은 선정 파이프라인의 두 필터라
 * 항상 이 순서로 함께 적용한다(유튜브를 먼저 걷어낸 뒤 남은 기사만 주식 필터 대상).
 */
function excludeNonNews(rows: RawContentRow[]): RawContentRow[] {
  const { kept: keptAfterYoutube } = filterOutYoutubeContent(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      originalUrl: r.original_url,
      sourceType: extractSourceType(r.sources),
    }))
  )
  const notYoutubeIds = new Set(keptAfterYoutube.map((k) => k.id))
  const afterYoutube = rows.filter((r) => notYoutubeIds.has(r.id))

  const { kept } = filterOutStockContent(
    afterYoutube.map((r) => ({ id: r.id, title: r.title, category: r.category, summary_ko: r.summary_ko }))
  )
  const keptIds = new Set(kept.map((k) => k.id))
  return afterYoutube.filter((r) => keptIds.has(r.id))
}

/** 버킷 ①~④ 후보를 각각의 DB 필터로 직접 조회(유튜브·주식 필터·상한 적용)한다. */
async function fetchGroupBuckets(
  supabase: SupabaseClient,
  names: CompetitorNameSets,
  weeklyExcludeIds: Set<string>
): Promise<{ buckets: Record<Exclude<NewsGroupKey, 'market_b2b'>, RawContentRow[]>; usedIds: Set<string> }> {
  const [competitorRows, aiRows, aidcGroupRows, aidcCloudRows, policyRows] = await Promise.all([
    queryTopContents(supabase, { column: 'matched_keywords', values: Array.from(names.telco) }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: AI_BIGTECH_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: AIDC_INFRA_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_keywords', values: Array.from(names.cloud) }, PER_BUCKET_FETCH_LIMIT),
    queryTopContents(supabase, { column: 'matched_groups', values: POLICY_GROUPS_LIST }, PER_BUCKET_FETCH_LIMIT),
  ])

  // 그 주 이미 노출된 기사(규칙 2)는 버킷 분류 이전에 걸러, 이번 회차 어느 섹션에도 다시 나오지 않게 한다.
  // §9-5-가: 최종 노출(MAX_CARDS_PER_GROUP)보다 1건 더 많은 CANDIDATE_CARDS_PER_GROUP 까지 후보로 남겨
  // 인사이트 생성 단계에 넘긴다.
  const usedIds = new Set<string>(weeklyExcludeIds)
  const dedupeAgainstUsed = (rows: RawContentRow[]): RawContentRow[] => {
    const result = rows.filter((r) => !usedIds.has(r.id)).slice(0, CANDIDATE_CARDS_PER_GROUP)
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
      competitor: dedupeAgainstUsed(excludeNonNews(competitorRows)),
      ai_bigtech: dedupeAgainstUsed(excludeNonNews(aiRows)),
      aidc_infra: dedupeAgainstUsed(excludeNonNews(aidcMerged)),
      policy: dedupeAgainstUsed(excludeNonNews(policyRows)),
    },
    usedIds,
  }
}

/**
 * 카드 선정(유튜브 배제 → 주식 필터 적용 → 5카테고리 분류, §2) → 카드별 인사이트 배치 생성(1콜) →
 * 티저 3종 조회를 한 번에 처리한다. cron/manual 발송과 관리자 미리보기가 공유하는 단일 지점.
 *
 * generateInsights=false 로 호출하면 LLM 호출 없이 카드/티저만 반환한다(가벼운 미리보기용).
 */
export async function prepareNewsletterIssue(
  supabase: SupabaseClient,
  {
    baseUrl,
    generateInsights = true,
    now = new Date(),
  }: { cardCount: number; baseUrl: string; generateInsights?: boolean; now?: Date }
): Promise<PreparedNewsletterIssue> {
  const weekOf = getKstWeekMondayString(now)

  // 최상단 티저 로테이션(§규칙1) — 그 주 풀 + 이미 소진된 키/노출 기사(§규칙2)를 먼저 계산해
  // 이후 뉴스 카드·지식보고서 선정에서 그대로 재사용한다.
  const [competitorNames, topTeaserPool, weeklyExposure] = await Promise.all([
    loadCompetitorNameSets(supabase),
    buildTopTeaserPool(supabase, weekOf, baseUrl),
    getWeeklyExposure(supabase, weekOf),
  ])

  const topTeaser = pickTopTeaser(topTeaserPool, weeklyExposure.usedTeaserKeys)
  const weeklyExcludeIds = new Set<string>(weeklyExposure.usedContentIds)
  if (topTeaser) for (const id of topTeaser.articleIds) weeklyExcludeIds.add(id)

  const { buckets, usedIds } = await fetchGroupBuckets(supabase, competitorNames, weeklyExcludeIds)

  // ⑤ 시장·B2B동향 — 넓은 일반 후보 풀에서 ①~④ 어디에도 속하지 않는(=진짜 잔여) 기사만 채운다.
  const residualPool = excludeNonNews(await queryTopContents(supabase, null, RESIDUAL_POOL_LIMIT))
  const marketRows = pickResidualMarketCandidates(
    residualPool.map((r) => ({ ...r, matchedGroups: r.matched_groups ?? [], matchedKeywords: r.matched_keywords ?? [] })),
    competitorNames,
    usedIds,
    CANDIDATE_CARDS_PER_GROUP
  )

  // candidateBuckets: 그룹당 최대 CANDIDATE_CARDS_PER_GROUP 건(§9-5-가) — 아직 최종 카드가 아니다.
  const candidateBuckets: Record<NewsGroupKey, RawContentRow[]> = { ...buckets, market_b2b: marketRows }
  const candidates = NEWS_GROUP_DEFS.flatMap((def) => candidateBuckets[def.key])

  // 관련기사 배제 집합(§3-3): 그 회차 전체 카드 id + weeklyExcludeIds. 후보 전체(candidates)를
  // 기준으로 넉넉히 배제한다 — 최종 탈락분이 있어도 과다 배제일 뿐 안전하다. 관련기사로 쓴 id 는
  // usedIds 에 넣지 않는다 — 다음 회차 카드 후보에서 빠지면 안 된다(보조 링크일 뿐).
  const relatedArticleExcludeIds = new Set<string>(weeklyExcludeIds)
  for (const r of candidates) relatedArticleExcludeIds.add(r.id)

  // LLM 콜(인사이트)과 순수 DB 조회(관련기사)는 서로 의존이 없으니 병렬 실행한다
  // (직렬로 붙이면 cron 시간만 늘어난다). 관련기사는 후보 전체 기준으로 미리 조회해두고,
  // 아래에서 최종 카드로 확정된 것만 꺼내 쓴다.
  const [insights, relatedArticlesByCard] = await Promise.all([
    generateInsights
      ? generateCardInsights(candidates.map((r) => ({ id: r.id, title: r.title, summaryKo: r.summary_ko })))
      : Promise.resolve(new Map<string, CardInsight>()),
    fetchRelatedArticles(
      supabase,
      candidates.map((r) => ({ id: r.id })),
      baseUrl,
      relatedArticleExcludeIds
    ),
  ])

  // §9-5: 인사이트가 없는(why 도 action 도 없는) 후보는 카드에서 뺀다. 살아남은 것 중 그룹당
  // 상위 MAX_CARDS_PER_GROUP 건만 최종 카드로 낸다. generateInsights=false(어드민 가벼운 미리보기)면
  // 인사이트 자체를 생성하지 않았으므로 이 필터를 적용하지 않고 후보 상위 N건을 그대로 낸다.
  const finalizeBucket = (rows: RawContentRow[]): RawContentRow[] => {
    if (!generateInsights) return rows.slice(0, MAX_CARDS_PER_GROUP)
    return rows.filter((r) => insights.get(r.id)?.why || insights.get(r.id)?.action).slice(0, MAX_CARDS_PER_GROUP)
  }

  let finalBuckets: Record<NewsGroupKey, RawContentRow[]> = Object.fromEntries(
    NEWS_GROUP_DEFS.map((def) => [def.key, finalizeBucket(candidateBuckets[def.key])])
  ) as Record<NewsGroupKey, RawContentRow[]>

  // §9-5-다 전멸 방지: 인사이트 필터로 전체 카드가 0장이 되면(모든 그룹이 비면) dispatch.ts 의
  // no_contents 가스켓에 걸려 그날 메일이 아예 안 나간다. 이 경우 인사이트 없이 원래 후보 상위
  // N건을 그대로 내보낸다(LLM 실패 시 인사이트 없이 발송하는 기존 폴백과 같은 취지).
  const totalFinalCards = NEWS_GROUP_DEFS.reduce((sum, def) => sum + finalBuckets[def.key].length, 0)
  if (generateInsights && totalFinalCards === 0) {
    finalBuckets = Object.fromEntries(
      NEWS_GROUP_DEFS.map((def) => [def.key, candidateBuckets[def.key].slice(0, MAX_CARDS_PER_GROUP)])
    ) as Record<NewsGroupKey, RawContentRow[]>
  }

  const toCard = (r: RawContentRow): PreparedCard => ({
    id: r.id,
    title: r.title,
    category: r.category,
    sourceName: extractSourceName(r.sources),
    summaryKo: r.summary_ko,
    originalUrl: r.original_url,
    detailUrl: `${baseUrl}/dashboard/contents/${r.id}`,
    insight: insights.get(r.id) ?? null,
    relatedArticles: relatedArticlesByCard.get(r.id) ?? [],
  })

  const newsGroups: PreparedNewsGroup[] = NEWS_GROUP_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    cards: finalBuckets[def.key].map(toCard),
  }))

  const finalSelected = NEWS_GROUP_DEFS.flatMap((def) => finalBuckets[def.key])
  const relatedGroups = Array.from(new Set(finalSelected.flatMap((r) => r.matched_groups ?? [])))

  // 뉴스 카드 선정으로 usedIds 가 더 채워졌으니, 지식보고서 배제 집합은 usedIds 최종본을 사용.
  const knowledgeReports = await getKnowledgeReportTeasers(supabase, baseUrl, relatedGroups, usedIds)

  return { newsGroups, topTeaser, knowledgeReports }
}
