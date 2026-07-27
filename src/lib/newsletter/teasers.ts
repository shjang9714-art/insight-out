import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export interface DailyInsightTeaser {
  id: string
  headline: string
  summaryKo: string
  detailUrl: string
}

export interface KnowledgeReportTeaser {
  id: string
  category: string
  title: string
  teaser: string
  detailUrl: string
}

export interface CompanyTrendLine {
  company: string
  trend: string
  isLgu: boolean
}

const KNOWLEDGE_REPORT_CATEGORIES = ['지식보고서', '리포트', '가트너', 'KRG'] as const

/**
 * 2-1. 주간 핵심 인사이트 티저 — 신규 생성 없이 웹(/dashboard/daily-insights/[id])에 이미
 * 발행된 시사점을 그대로 재사용한다. 최신 week_of 중 display_order 최솟값(=탭·홈 첫 칸 고정건,
 * 386571e 와 동일 규칙)을 그 회차의 대표 인사이트로 선택. 없으면 null(섹션 생략).
 */
export async function getDailyInsightTeaser(
  supabase: SupabaseClient,
  baseUrl: string
): Promise<DailyInsightTeaser | null> {
  const { data: latest, error: latestErr } = await supabase
    .from('daily_insights')
    .select('week_of')
    .eq('status', 'published')
    .order('week_of', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) {
    console.error('[뉴스레터/티저] 핵심 인사이트 최신 주차 조회 실패:', latestErr.message)
    return null
  }
  if (!latest?.week_of) return null

  const { data, error } = await supabase
    .from('daily_insights')
    .select('id, headline, summary_ko')
    .eq('status', 'published')
    .eq('week_of', latest.week_of)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[뉴스레터/티저] 핵심 인사이트 조회 실패:', error.message)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    headline: stripLlmArtifacts(data.headline),
    summaryKo: stripLlmArtifacts(data.summary_ko),
    detailUrl: `${baseUrl}/dashboard/daily-insights/${data.id}`,
  }
}

/**
 * 2-2. 함께 보면 좋은 지식보고서 — 이번 회차 뉴스 카드와 카테고리/매치그룹 겹침 우선,
 * 없으면 최신순. 2~3건. 없으면 빈 배열(섹션 생략).
 */
export async function getKnowledgeReportTeasers(
  supabase: SupabaseClient,
  baseUrl: string,
  relatedGroups: string[],
  limit = 3
): Promise<KnowledgeReportTeaser[]> {
  const { data, error } = await supabase
    .from('contents')
    .select('id, title, summary_ko, category, matched_groups, published_at, collected_at')
    .eq('status', 'published')
    .in('category', KNOWLEDGE_REPORT_CATEGORIES as unknown as string[])
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('collected_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[뉴스레터/티저] 지식보고서 조회 실패:', error.message)
    return []
  }
  if (!data || data.length === 0) return []

  const relatedSet = new Set(relatedGroups)
  const withOverlap = data.filter((r) => (r.matched_groups ?? []).some((g: string) => relatedSet.has(g)))
  const ranked = withOverlap.length > 0 ? withOverlap : data

  return ranked.slice(0, limit).map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    teaser: firstSentence(r.summary_ko),
    detailUrl: `${baseUrl}/dashboard/contents/${r.id}`,
  }))
}

function firstSentence(text: string | null): string {
  if (!text) return ''
  const trimmed = text.trim()
  const match = trimmed.match(/^[^.!?。]*[.!?。]/)
  return (match ? match[0] : trimmed).slice(0, 100)
}

/**
 * 2-3. 기업 동향 브리핑 — 가장 최근 발행된 경쟁사 주간 브리핑에서 회사별 한 줄 동향 3~5개.
 * 데이터 없으면 빈 배열(섹션 생략). 상세 페이지는 비로그인 공개 범위 밖이라 링크 없이 텍스트만.
 */
export async function getCompanyTrendLines(supabase: SupabaseClient, limit = 5): Promise<CompanyTrendLine[]> {
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select('sections')
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[뉴스레터/티저] 기업 동향 브리핑 조회 실패:', error.message)
    return []
  }
  if (!data?.sections || !Array.isArray(data.sections)) return []

  interface RawSection {
    companies?: string[]
    moves?: string
  }

  // moves는 여러 문장 + [content_id] 인용 각주가 섞인 문단이라, 뉴스레터엔 첫 문장만
  // 각주를 제거해 한 줄로 축약한다.
  function toOneLiner(moves: string): string {
    const withoutCitations = moves.replace(/\s*\[[0-9a-f-]{8,}\]/gi, '')
    return firstSentence(withoutCitations)
  }

  const lines: CompanyTrendLine[] = []
  for (const section of data.sections as RawSection[]) {
    const company = section.companies?.[0]
    if (!company || !section.moves) continue
    lines.push({ company, trend: toOneLiner(section.moves), isLgu: /LG\s*유플러스|LGU\+|LG U\+/i.test(company) })
    if (lines.length >= limit) break
  }

  return lines
}
