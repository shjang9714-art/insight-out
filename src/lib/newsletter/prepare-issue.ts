import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterOutStockContent, filterOutYoutubeContent } from '@/lib/newsletter/content-filter'
import { generateCardInsights } from '@/lib/newsletter/card-insights'
import {
  getDailyInsightTeaser,
  getKnowledgeReportTeasers,
  getCompanyTrendLines,
  type DailyInsightTeaser,
  type KnowledgeReportTeaser,
  type CompanyTrendLine,
} from '@/lib/newsletter/teasers'

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

export interface PreparedNewsletterIssue {
  cards: PreparedCard[]
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

/**
 * 카드 선정(주식 필터 적용) → 카드별 인사이트 배치 생성(1콜) → 티저 3종 조회를
 * 한 번에 처리한다. cron/manual 발송과 관리자 미리보기가 공유하는 단일 지점.
 *
 * generateInsights=false 로 호출하면 LLM 호출 없이 카드/티저만 반환한다(가벼운 미리보기용).
 */
export async function prepareNewsletterIssue(
  supabase: SupabaseClient,
  {
    cardCount,
    baseUrl,
    generateInsights = true,
  }: { cardCount: number; baseUrl: string; generateInsights?: boolean }
): Promise<PreparedNewsletterIssue> {
  // 필터로 걸러질 것을 감안해 후보를 카드 수의 4배(최대 40건) 만큼 넉넉히 조회.
  const candidateLimit = Math.min(cardCount * 4, 40)

  const { data: candidates, error } = await supabase
    .from('contents')
    .select('id, title, category, summary_ko, original_url, matched_groups, sources(name, type)')
    .eq('status', 'published')
    .order('is_editor_pick', { ascending: false })
    .order('view_count', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(candidateLimit)

  if (error) {
    console.error('[뉴스레터/카드선정] 콘텐츠 조회 실패:', error.message)
    return { cards: [], dailyInsight: null, knowledgeReports: [], companyTrends: [] }
  }

  const rows = (candidates ?? []) as unknown as RawContentRow[]
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
  const { kept } = filterOutStockContent(
    rows
      .filter((r) => notYoutubeIds.has(r.id))
      .map((r) => ({ id: r.id, title: r.title, category: r.category, summary_ko: r.summary_ko }))
  )
  const keptIds = new Set(kept.map((k) => k.id))
  const selected = rows.filter((r) => keptIds.has(r.id)).slice(0, cardCount)

  const insights = generateInsights
    ? await generateCardInsights(selected.map((r) => ({ id: r.id, title: r.title, summaryKo: r.summary_ko })))
    : new Map<string, string>()

  const cards: PreparedCard[] = selected.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    sourceName: extractSourceName(r.sources),
    summaryKo: r.summary_ko,
    originalUrl: r.original_url,
    detailUrl: `${baseUrl}/dashboard/contents/${r.id}`,
    insight: insights.get(r.id) ?? null,
  }))

  const relatedGroups = Array.from(new Set(selected.flatMap((r) => r.matched_groups ?? [])))

  const [dailyInsight, knowledgeReports, companyTrends] = await Promise.all([
    getDailyInsightTeaser(supabase, baseUrl),
    getKnowledgeReportTeasers(supabase, baseUrl, relatedGroups),
    getCompanyTrendLines(supabase),
  ])

  return { cards, dailyInsight, knowledgeReports, companyTrends }
}
