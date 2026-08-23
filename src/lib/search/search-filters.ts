import type { ContentCategory } from '@/lib/types'

// 통합 검색 카테고리 필터 — 앱 상단 탭(카테고리 계위)과 1:1로 맞춘 단일 축. DB 테이블
// 종류(contents/daily_insights/entities/keywords)는 구현 디테일일 뿐, 사용자에게는
// 카테고리 하나로만 보인다.
//
// 'report' 단일 버킷(리포트·가트너·KRG·AI보고서·지식보고서)은 통합검색 개편(2026-08-09)에서
// 자료실 L2 분류와 맞추기 위해 'ai-report'(AI 리포트)·
// 'consulting-report'(전문기관 보고서) 둘로 쪼갰다. 'disclosure'(기업 공시 = 기업자료)는 이전엔
// 어느 SEARCH_FILTER_DEFS에도 안 걸려 있어 검색에서 아예 조회되지 않던 카테고리라 이번에
// 새로 추가했다. DB enum 값(ContentCategory) 자체는 전혀 안 바뀜 — 검색 결과를 어느
// 버킷/라벨로 묶어 보여줄지만 바뀐 것.
//
// 'issue'(이슈 브리핑, source: 'issues')는 통합검색 후속 개편(2026-08-10)에서 검색 종류
// 버튼 목록에서 제외했다 — 이슈는 앱 상단 탭에 없는(=카테고리 계위가 아닌) 별도 요약물이라,
// 검색 버튼은 앱 카테고리만 반영해야 한다는 원칙에 안 맞았다. issues 테이블·데이터·
// /dashboard/issues·홈 급상승 등 다른 화면은 전혀 안 건드림 — "검색 버킷 목록에서만" 뺐다.
// use-unified-search.ts의 fetchIssues/IssueRow도 그대로 둔다(다른 곳에서 이 파일의
// 'issues' source 타입을 여전히 참조할 수 있어 안전하게 놔둠) — 아래 defs에 source:'issues'
// 항목이 없어지면 fetchSection의 그 분기가 자연히 호출되지 않을 뿐이다.

export type SearchFilterKey =
  | 'news' | 'youtube' | 'web-insight' | 'ai-report' | 'consulting-report' | 'disclosure'
  | 'insight' | 'company' | 'keyword'

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
  { key: 'insight', label: '핵심인사이트', source: 'daily_insights', badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { key: 'keyword', label: '키워드', source: 'keywords', badgeClass: 'bg-lime-50 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300' },
  { key: 'company', label: '기업동향', source: 'entities', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'news', label: '뉴스', source: 'content', categories: ['뉴스'], badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { key: 'youtube', label: '영상', source: 'content', categories: ['유튜브'], badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  // 사용자 노출 라벨은 NAV_SECTIONS와 같은 문자열로 맞추되, 정의는 각 목록에서 별도로 관리한다.
  { key: 'web-insight', label: '기술 블로그', source: 'content', categories: ['웹인사이트', '오피니언'], badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { key: 'ai-report', label: 'AI 리포트', source: 'content', categories: ['AI보고서', '지식보고서'], badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'consulting-report', label: '전문기관 보고서', source: 'content', categories: ['리포트', '가트너', 'KRG'], badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  { key: 'disclosure', label: '기업 공시', source: 'content', categories: ['기업자료'], badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300' },
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

/** 검색 결과 섹션 표시 순서(고정) — 핵심인사이트 → 키워드 → 기업동향 → 뉴스 →
 *  영상 → 기술 블로그 → AI 리포트 → 전문기관 보고서 → 기업 공시. 앱 상단 탭(카테고리 계위)에
 *  없는 '이슈 브리핑'은 검색 버킷에서 제외했다(위 파일 상단 주석 참고). */
export const SEARCH_SECTION_ORDER: SearchFilterKey[] = [
  'insight', 'keyword', 'company', 'news', 'youtube', 'web-insight', 'ai-report', 'consulting-report', 'disclosure',
]

/** '전체' 검색 시 섹션별 표시 상한 — 뉴스는 물량이 많으니 넉넉히, 나머지는 특정 종류가 화면을 뒤덮지 않게 */
export const SEARCH_SECTION_DISPLAY_CAP: Record<SearchFilterKey, number> = {
  insight: 12, company: 12, keyword: 12, 'ai-report': 12, 'consulting-report': 12, disclosure: 12, 'web-insight': 12, youtube: 12, news: 24,
}
