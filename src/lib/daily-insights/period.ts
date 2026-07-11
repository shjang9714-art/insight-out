// "핵심 인사이트" 목록 기간 필터(§지시서 20260711 기간필터·라벨칩·전구이모지).
// day_of('YYYY-MM-DD') 범위 계산은 여기서만 하고, 서버 쿼리(AiInsightsView)와
// 클라이언트 필터 UI(DailyInsightPeriodFilter) 양쪽이 이 모듈을 공유한다.

export type DailyInsightPeriod = 'today' | '7d' | '14d' | 'custom'

export const DAILY_INSIGHT_PERIODS: { id: DailyInsightPeriod; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '14d', label: '14일' },
  { id: 'custom', label: '사용자 지정' },
]

export interface DailyInsightDateRange {
  from: string
  to: string
}

const DAY_OF_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDayOf(value: string): boolean {
  return DAY_OF_RE.test(value)
}

/** day_of 문자열 기준 달력일 덧셈/뺄셈 — 로컬 타임존 재구성 없이 UTC 필드로만 계산해 하루 밀림을 피한다. */
export function shiftDayOf(dayOf: string, deltaDays: number): string {
  const [y, m, d] = dayOf.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * period/from/to 쿼리 파라미터를 day_of 범위로 해석.
 * 유효한 필터가 없으면 null(= 전체 목록, 무필터가 기본값).
 */
export function resolveDailyInsightDateRange(
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  todayStr: string,
): DailyInsightDateRange | null {
  switch (period) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case '7d':
      return { from: shiftDayOf(todayStr, -6), to: todayStr }
    case '14d':
      return { from: shiftDayOf(todayStr, -13), to: todayStr }
    case 'custom':
      if (from && to && isValidDayOf(from) && isValidDayOf(to) && from <= to) {
        return { from, to }
      }
      return null
    default:
      return null
  }
}
