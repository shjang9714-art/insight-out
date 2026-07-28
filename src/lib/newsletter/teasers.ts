import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

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
 * 2-2. 함께 보면 좋은 지식보고서 — 이번 회차 뉴스 카드와 카테고리/매치그룹 겹침 우선,
 * 없으면 최신순. 2~3건. 없으면 빈 배열(섹션 생략). excludeIds 는 그 주 이미 노출된 기사(규칙 2).
 */
export async function getKnowledgeReportTeasers(
  supabase: SupabaseClient,
  baseUrl: string,
  relatedGroups: string[],
  excludeIds: Set<string> = new Set(),
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

  const notExposed = data.filter((r) => !excludeIds.has(r.id))

  const relatedSet = new Set(relatedGroups)
  const withOverlap = notExposed.filter((r) => (r.matched_groups ?? []).some((g: string) => relatedSet.has(g)))
  const ranked = withOverlap.length > 0 ? withOverlap : notExposed

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
