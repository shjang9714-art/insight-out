// key-insights/constants.ts 의 7개 카테고리를 그대로 재사용(신규 정의 금지, 가이드 §1 단일 진실).
export { KEY_INSIGHT_CATEGORIES as DAILY_INSIGHT_CATEGORIES } from '@/lib/key-insights/constants'
export type { KeyInsightCategory as DailyInsightCategory } from '@/lib/key-insights/constants'

// "핵심 인사이트" 목록 페이지(§지시서 20260711 fast-follow §1)에 노출할 최근 일수.
// 값을 조정하려면 이 상수만 바꾸면 된다(쿼리 범위·표시 범위 둘 다 여기서 파생).
export const DAILY_LIST_WINDOW_DAYS = 14
