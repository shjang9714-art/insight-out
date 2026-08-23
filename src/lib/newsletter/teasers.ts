import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface KnowledgeReportTeaser {
  id: string
  category: string
  title: string
  teaser: string
  detailUrl: string
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
    .is('deleted_at', null)
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
