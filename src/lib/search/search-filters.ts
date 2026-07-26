import type { ContentCategory } from '@/lib/types'

// 통합 검색 카테고리 필터 — 앱 기존 IA(뉴스/유튜브/웹인사이트/리포트)에 핵심인사이트·이슈를
// 얹은 단일 축. DB 테이블 종류(contents/daily_insights/issues)는 구현 디테일일 뿐,
// 사용자에게는 카테고리 하나로만 보인다.

export type SearchFilterKey = 'news' | 'youtube' | 'web-insight' | 'report' | 'insight' | 'issue' | 'company' | 'keyword'

export interface SearchFilterDef {
  key: SearchFilterKey
  label: string
  badgeClass: string
  /** 'content'면 contents 테이블 category IN (categories) 로 필터, 그 외는 전용 테이블/뷰 전체 */
  source: 'content' | 'daily_insights' | 'issues' | 'entities' | 'keywords'
  /** source==='content'일 때만 사용 — categories.ts DB_CONTENT_CATEGORIES 기준 실제 enum 값 */
  categories?: ContentCategory[]
}

export const SEARCH_FILTER_DEFS: SearchFilterDef[] = [
  { key: 'news', label: '뉴스', source: 'content', categories: ['뉴스'], badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { key: 'youtube', label: '유튜브', source: 'content', categories: ['유튜브'], badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { key: 'web-insight', label: '웹인사이트', source: 'content', categories: ['웹인사이트', '오피니언'], badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { key: 'report', label: '리포트', source: 'content', categories: ['리포트', '가트너', 'KRG', 'AI보고서', '지식보고서'], badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
  { key: 'insight', label: '핵심인사이트', source: 'daily_insights', badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { key: 'issue', label: '이슈', source: 'issues', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  { key: 'company', label: '기업동향', source: 'entities', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'keyword', label: '키워드', source: 'keywords', badgeClass: 'bg-lime-50 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300' },
]

export function isSearchFilterKey(v: string | null | undefined): v is SearchFilterKey {
  return !!v && SEARCH_FILTER_DEFS.some((d) => d.key === v)
}

export function searchFilterLabel(key: SearchFilterKey): string {
  return SEARCH_FILTER_DEFS.find((d) => d.key === key)?.label ?? key
}

export function searchFilterDef(key: SearchFilterKey): SearchFilterDef {
  return SEARCH_FILTER_DEFS.find((d) => d.key === key)!
}
