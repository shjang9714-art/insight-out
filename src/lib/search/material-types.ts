// 통합 검색 '자료 종류' 필터 — 주제 카테고리(CATEGORY_DEFS)와는 다른 축.
// 콘텐츠(contents 테이블) vs 인사이트(daily_insights) vs 이슈(issues).
// 보고서(ai_reports)는 제외 — 지식보고서는 이미 contents(콘텐츠)로 검색되고,
// ai_reports는 개인 소유 보고서라 공개 통합검색 종류로 부적합.

export type MaterialType = 'content' | 'insight' | 'issue'

export interface MaterialTypeDef {
  type: MaterialType
  label: string
  /** 결과 카드 배지 색상 클래스 */
  badgeClass: string
}

export const MATERIAL_TYPE_DEFS: MaterialTypeDef[] = [
  { type: 'content', label: '콘텐츠', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { type: 'insight', label: '인사이트', badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { type: 'issue', label: '이슈', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
]

export function isMaterialType(v: string | null | undefined): v is MaterialType {
  return !!v && MATERIAL_TYPE_DEFS.some((d) => d.type === v)
}

export function materialTypeLabel(type: MaterialType): string {
  return MATERIAL_TYPE_DEFS.find((d) => d.type === type)?.label ?? type
}
