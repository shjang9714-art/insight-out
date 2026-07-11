// key-insights/constants.ts 의 7개 카테고리를 그대로 재사용(신규 정의 금지, 가이드 §1 단일 진실).
export { KEY_INSIGHT_CATEGORIES as DAILY_INSIGHT_CATEGORIES } from '@/lib/key-insights/constants'
export type { KeyInsightCategory as DailyInsightCategory } from '@/lib/key-insights/constants'

// 카테고리별 라벨칩 색상(§지시서 20260711 기간필터·라벨칩·전구이모지 §2).
// 사이트 전반은 무채색+브랜드 핑크로 통일돼 있으나, 이 다색 매핑은 "핵심 인사이트"
// 라벨칩에 한정된 승인 예외다 — 다른 화면 칩에 전파 금지.
// 매핑에 없는 category 값(미분류 등)은 호출부에서 기존 무채색 secondary 배지로 폴백한다.
export const CATEGORY_CHIP_COLOR: Record<string, string> = {
  '자사·통신사 동향': 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  'AIDC·클라우드': 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  'AICC·비즈콜': 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  '사이버보안': 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  '통신사업·커넥티비티': 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  '정책·정부': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  '빅테크·One LG': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
}
