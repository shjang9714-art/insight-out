import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKstTodayStartIso } from '@/lib/date'

export const COMPETITOR_GROUP_ORDER = ['통신', '클라우드·플랫폼', '빅테크']
export const COMPETITOR_FALLBACK_GROUP = '기타 경쟁사'

export type LguImpactValue = '위기' | '기회' | '관망'

export interface CompArticle {
  id: string
  title: string
  collected_at: string
  lgu_impact: LguImpactValue | null
  matched_keywords: string[]
  sources: { name: string } | { name: string }[] | null
}

export interface CompImpactDist { 위기: number; 기회: number; 관망: number }

export interface CompResult {
  name: string
  articles: CompArticle[]
  articleTotal: number
  impactDist: CompImpactDist
}

export interface CompGroupBucket {
  name: string
  results: CompResult[]
  articleTotal: number
  impactDist: CompImpactDist
}

export interface CompetitorNewsData {
  competitorCount: number
  groups: CompGroupBucket[]
  overallImpactDist: CompImpactDist
}

const emptyImpactDist = (): CompImpactDist => ({ 위기: 0, 기회: 0, 관망: 0 })

export interface CompetitorNewsOpts {
  /** 조회 기간(일). 기본 14 */
  days?: number
  /** 기사 조회 총량 상한(전 경쟁사 합산). 기본 80 */
  articleQueryLimit?: number
  /** 회사 카드에 담을 기사 수(더보기 전 표시분 계산 기준). 기본 5 */
  articlesPerCompany?: number
}

/**
 * 경쟁사 최근 뉴스 그룹핑 데이터 조립(242) — competitor_group(224)·lgu_impact(241) 42703 graceful.
 * 요약(entities/page.tsx competitor 뷰)·전체 페이지(245)가 동일 로직 공유.
 */
export async function getCompetitorNewsData(
  supabase: SupabaseClient,
  opts: CompetitorNewsOpts = {},
): Promise<CompetitorNewsData> {
  const days = opts.days ?? 14
  const articleQueryLimit = opts.articleQueryLimit ?? 80
  const articlesPerCompany = opts.articlesPerCompany ?? 5

  const todayStartMs = new Date(getKstTodayStartIso()).getTime()
  const periodStart = new Date(todayStartMs - (days - 1) * 24 * 60 * 60 * 1000).toISOString()

  type CompetitorRow = { canonical_name: string; competitor_group: string | null }
  const { data: competitorRows, error: competitorGroupErr } = await supabase
    .from('entities')
    .select('canonical_name, competitor_group')
    .eq('is_competitor', true)
    .limit(50)

  let compRows: CompetitorRow[]
  if (competitorGroupErr?.code === '42703') {
    // competitor_group 컬럼 미적용(224 SQL 미실행) — 그룹 없이 재조회, graceful
    const { data: fallbackRows } = await supabase
      .from('entities')
      .select('canonical_name')
      .eq('is_competitor', true)
      .limit(50)
    compRows = ((fallbackRows ?? []) as { canonical_name: string }[]).map(r => ({ ...r, competitor_group: null }))
  } else {
    compRows = (competitorRows ?? []) as CompetitorRow[]
  }

  const competitorCount = compRows.length
  const groups: CompGroupBucket[] = []
  const overallImpactDist = emptyImpactDist()

  if (compRows.length === 0) {
    return { competitorCount, groups, overallImpactDist }
  }

  const competitorNames = compRows.map(r => r.canonical_name).filter(Boolean)

  const { data: compArticleData, error: articlesErr } = await supabase
    .from('contents')
    .select('id, title, collected_at, lgu_impact, matched_keywords, sources(name)')
    .eq('status', 'published')
    .gte('collected_at', periodStart)
    .overlaps('matched_keywords', competitorNames)
    .order('collected_at', { ascending: false })
    .limit(articleQueryLimit)

  let allCompArticles: CompArticle[]
  if (articlesErr?.code === '42703') {
    // lgu_impact 컬럼 미적용(241 SQL 미실행) — 칩 없이 재조회, graceful
    const { data: fallbackArticles } = await supabase
      .from('contents')
      .select('id, title, collected_at, matched_keywords, sources(name)')
      .eq('status', 'published')
      .gte('collected_at', periodStart)
      .overlaps('matched_keywords', competitorNames)
      .order('collected_at', { ascending: false })
      .limit(articleQueryLimit)
    allCompArticles = ((fallbackArticles ?? []) as unknown[]).map(r => ({ ...(r as object), lgu_impact: null }) as CompArticle)
  } else {
    allCompArticles = (compArticleData ?? []) as unknown as CompArticle[]
  }

  const byGroup = new Map<string, CompResult[]>()
  for (const comp of compRows) {
    const nameLower = comp.canonical_name.toLowerCase()
    const matched = allCompArticles.filter(a =>
      (a.matched_keywords ?? []).some(k => k.toLowerCase() === nameLower)
    )
    if (matched.length === 0) continue

    const impactDist = emptyImpactDist()
    for (const a of matched) {
      if (a.lgu_impact === '위기') impactDist['위기']++
      else if (a.lgu_impact === '기회') impactDist['기회']++
      else if (a.lgu_impact === '관망') impactDist['관망']++
    }

    const groupName = comp.competitor_group || COMPETITOR_FALLBACK_GROUP
    if (!byGroup.has(groupName)) byGroup.set(groupName, [])
    byGroup.get(groupName)!.push({
      name: comp.canonical_name,
      articles: matched.slice(0, articlesPerCompany),
      articleTotal: matched.length,
      impactDist,
    })
  }

  const orderedGroupNames = [
    ...COMPETITOR_GROUP_ORDER.filter(g => byGroup.has(g)),
    ...[...byGroup.keys()].filter(g => g !== COMPETITOR_FALLBACK_GROUP && !COMPETITOR_GROUP_ORDER.includes(g)),
    ...(byGroup.has(COMPETITOR_FALLBACK_GROUP) ? [COMPETITOR_FALLBACK_GROUP] : []),
  ]

  for (const groupName of orderedGroupNames) {
    const results = byGroup.get(groupName)!
    const groupDist = emptyImpactDist()
    let articleTotal = 0
    for (const r of results) {
      groupDist['위기'] += r.impactDist['위기']
      groupDist['기회'] += r.impactDist['기회']
      groupDist['관망'] += r.impactDist['관망']
      articleTotal += r.articleTotal
    }
    overallImpactDist['위기'] += groupDist['위기']
    overallImpactDist['기회'] += groupDist['기회']
    overallImpactDist['관망'] += groupDist['관망']
    groups.push({ name: groupName, results, articleTotal, impactDist: groupDist })
  }

  return { competitorCount, groups, overallImpactDist }
}
