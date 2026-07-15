// "핵심 인사이트" 주차 헤더·선택기 공용 유틸(§2, 지시서 20260715). week_of는 항상 월요일(KST) 문자열.

import { KEY_INSIGHT_CATEGORIES } from '@/lib/key-insights/constants'

/** week_of(월요일) 문자열 기준 달력일 덧셈 — UTC 필드로만 계산해 하루 밀림을 피한다(date.ts 패턴과 동일). */
function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** 그 주의 일요일(마지막 날). */
export function getWeekEndDate(weekOf: string): string {
  return shiftDateStr(weekOf, 6)
}

/** "2026-07-13 ~ 07-19" 형태 라벨. */
export function formatWeekLabel(weekOf: string): string {
  const end = getWeekEndDate(weekOf)
  const [, endMonth, endDay] = end.split('-')
  return `${weekOf} ~ ${endMonth}-${endDay}`
}

/** "{월}월 {N}주차" 라벨. 해당 월 1일이 속한 주(월요일 기준)를 1주차로, 이후 월요일마다 +1. */
export function formatMonthWeekLabel(weekOf: string): string {
  const [y, m, d] = weekOf.split('-').map(Number)
  const firstOfMonthMs = Date.UTC(y, m - 1, 1)
  const firstDow = new Date(firstOfMonthMs).getUTCDay() // 0=일 ~ 6=토
  const mondayOffsetDays = (firstDow + 6) % 7 // 1일이 속한 주의 월요일까지 며칠 전인지
  const week1MondayMs = firstOfMonthMs - mondayOffsetDays * 24 * 60 * 60 * 1000
  const weekOfMs = Date.UTC(y, m - 1, d)
  const weekIndex = Math.round((weekOfMs - week1MondayMs) / (7 * 24 * 60 * 60 * 1000)) + 1
  return `${m}월 ${weekIndex}주차`
}

export interface WeekSummary {
  weekOf: string
  total: number
  newCount: number
  categoryCoverage: number
}

/** 주차 헤더 배지 계산 — 선택된 주가 최신 주일 때만 NEW 뱃지가 유효(그 주 전량이 이번에 새로 실린 것). */
export function buildWeekSummary(
  weekOf: string,
  insightsInWeek: { category: string | null }[],
  isLatestWeek: boolean
): WeekSummary {
  const distinctCategories = new Set(insightsInWeek.map((i) => i.category).filter((c): c is string => !!c))
  return {
    weekOf,
    total: insightsInWeek.length,
    newCount: isLatestWeek ? insightsInWeek.length : 0,
    categoryCoverage: distinctCategories.size,
  }
}

export const TOTAL_CATEGORY_COUNT = KEY_INSIGHT_CATEGORIES.length
