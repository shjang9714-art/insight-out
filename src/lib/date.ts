/** 'YYYY-MM-DD'(KST 날짜) 문자열이 가리키는 KST 0시를 UTC ISO 문자열로 반환 */
export function getKstDayStartIso(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const midnightUtc = Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000
  return new Date(midnightUtc).toISOString()
}

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

/** 'YYYY-MM-DD' 문자열 두 개 사이의 일수 차이(toDateStr - fromDateStr). 홈 핵심 인사이트 스텝-윈도우 로테이션 시드용. */
export function daysBetweenKstDateStrings(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000))
}

/** 임의 시각이 속한 KST 주(월요일 시작)의 월요일을 'YYYY-MM-DD'로. */
export function getKstWeekMondayString(date: Date = new Date()): string {
  const { year, month, day, weekday } = getKstDateParts(date)
  const daysSinceMonday = (weekday + 6) % 7 // Mon=0 ... Sun=6
  const mondayMs = Date.UTC(year, month - 1, day) - daysSinceMonday * 24 * 60 * 60 * 1000
  const d = new Date(mondayMs)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' 문자열을 그 표기 그대로(달력일 단위, 시간대 변환 없이) days만큼 이동한다. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD'(KST 날짜) 문자열이 가리키는 KST 0시를 UTC ISO 문자열로. getKstDayStartIso와 동일한
 * 계산이지만 `${dateStr}T00:00:00+09:00` 파싱 방식 — competitor-weekly/generate.ts 원본 시그니처 유지. */
export function kstDateToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString()
}

/** KST 기준 "가장 최근에 완결된" 월~일 주(현재 진행 중인 주가 아니라 그 직전 주).
 * daily-insights·competitor-weekly 배치가 공유하는 주차 계산 — 배치를 월요일에 돌리든
 * 캐치업으로 화·수에 돌리든 항상 같은 주(직전 완결 주)를 가리켜야 라벨과 수집 구간이 어긋나지 않는다. */
export function getLastCompletedWeekKst(): { weekStart: string; weekEnd: string } {
  const todayStr = getKstDateString()
  const today = new Date(`${todayStr}T00:00:00Z`)
  const dow = today.getUTCDay() // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7
  const thisMondayStr = addDaysToDateStr(todayStr, -daysSinceMonday)
  const lastMondayStr = addDaysToDateStr(thisMondayStr, -7)
  const lastSundayStr = addDaysToDateStr(lastMondayStr, 6)
  return { weekStart: lastMondayStr, weekEnd: lastSundayStr }
}

/** 임의 시각을 KST 기준 시(0~23)로. */
export function getKstHour(date: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  }).format(date)
  // Intl 은 자정을 '24'로 표기하는 로케일이 있어 24 → 0 보정
  return Number(hour) % 24
}
