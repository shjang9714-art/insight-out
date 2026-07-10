/** KST 기준 오늘 0시를 UTC ISO 문자열로 반환 */
export function getKstTodayStartIso(): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const midnightUtc =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    9 * 60 * 60 * 1000
  return new Date(midnightUtc).toISOString()
}

export interface KstDateParts {
  year: number
  month: number
  day: number
  /** 0=일 ... 6=토 */
  weekday: number
}

/** 임의 시각을 KST 기준 연/월/일/요일로 분해. */
export function getKstDateParts(date: Date = new Date()): KstDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
    weekday: weekdayMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'],
  }
}

/** 임의 시각을 KST 기준 'YYYY-MM-DD' 문자열로. */
export function getKstDateString(date: Date = new Date()): string {
  const { year, month, day } = getKstDateParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
