import type { ContentCategory } from '@/lib/types'

// 통합 검색 카테고리 필터 — 앱 기존 IA(뉴스/유튜브/웹인사이트/리포트)에 핵심인사이트·이슈를
// 얹은 단일 축. DB 테이블 종류(contents/daily_insights/issues)는 구현 디테일일 뿐,
// 사용자에게는 카테고리 하나로만 보인다.
//
// 'report' 단일 버킷(리포트·가트너·KRG·AI보고서·지식보고서)은 통합검색 개편(2026-08-09)에서
// 자료실 L2 탭 라벨(lib/nav/taxonomy.tsx NAV_SECTIONS)과 맞추기 위해 'ai-report'(AI 리포트)·
// 'consulting-report'(컨설팅 리포트) 둘로 쪼갰다. 'disclosure'(공시자료 = 기업자료)는 이전엔
// 어느 SEARCH_FILTER_DEFS에도 안 걸려 있어 검색에서 아예 조회되지 않던 카테고리라 이번에
// 새로 추가했다. DB enum 값(ContentCategory) 자체는 전혀 안 바뀜 — 검색 결과를 어느
// 버킷/라벨로 묶어 보여줄지만 바뀐 것.

export type SearchFilterKey =
  | 'news' | 'youtube' | 'web-insight' | 'ai-report' | 'consulting-report' | 'disclosure'
  | 'insight' | 'issue' | 'company' | 'keyword'

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
  { key: 'issue', label: '이슈 브리핑', source: 'issues', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  { key: 'news', label: '뉴스', source: 'content', categories: ['뉴스'], badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { key: 'youtube', label: '유튜브', source: 'content', categories: ['유튜브'], badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  // 라벨 '기술 Blog'는 lib/nav/taxonomy.tsx CATEGORY_DEFS의 'web-insight' 라벨과 동일(재사용)
  { key: 'web-insight', label: '기술 Blog', source: 'content', categories: ['웹인사이트', '오피니언'], badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { key: 'ai-report', label: 'AI 리포트', source: 'content', categories: ['AI보고서', '지식보고서'], badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'consulting-report', label: '컨설팅 리포트', source: 'content', categories: ['리포트', '가트너', 'KRG'], badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  { key: 'disclosure', label: '공시자료', source: 'content', categories: ['기업자료'], badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300' },
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

/** 검색 결과 섹션 표시 순서(고정) — 핵심인사이트 → 이슈 브리핑 → 키워드 → 기업동향 → 뉴스 →
 *  유튜브 → 기술 Blog → AI 리포트 → 컨설팅 리포트 → 공시자료.
 *  '이슈 브리핑'(source: 'issues')은 issues 테이블(여러 기사를 묶어 LLM이 요약한 사건
 *  클러스터)을 조회 — 'news'(contents.category='뉴스', 개별 원본 기사)와는 테이블·데이터가
 *  완전히 별개다(2026-08-09 조사 확인, PK·결과 key 접두어도 issue-/content- 로 분리).
 *  라벨을 '이슈'→'이슈 브리핑'으로 바꾼 것도 이 차이(사건 요약물이지 개별 기사가 아님)를
 *  명확히 하기 위함 — source/categories/쿼리는 전혀 안 바뀜, 순수 표시 문자열+순서만 변경. */
export const SEARCH_SECTION_ORDER: SearchFilterKey[] = [
  'insight', 'issue', 'keyword', 'company', 'news', 'youtube', 'web-insight', 'ai-report', 'consulting-report', 'disclosure',
]

/** '전체' 검색 시 섹션별 표시 상한 — 뉴스는 물량이 많으니 넉넉히, 나머지는 특정 종류가 화면을 뒤덮지 않게 */
export const SEARCH_SECTION_DISPLAY_CAP: Record<SearchFilterKey, number> = {
  insight: 12, issue: 12, company: 12, keyword: 12, 'ai-report': 12, 'consulting-report': 12, disclosure: 12, 'web-insight': 12, youtube: 12, news: 24,
}
