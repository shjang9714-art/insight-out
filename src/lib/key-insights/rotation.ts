// 홈 "주목하세요, 핵심 Insight" 일일 로테이션(2026-07-10) — 순수 함수, DB/서버 의존 없음(테스트 용이).
// 그 주 published 풀(6~10건) 안에서 KST 날짜 기준 슬라이딩 윈도우로 매일 다른 N건을 결정론적으로 고른다.

/**
 * week_of 기준 오늘(KST)까지 며칠 지났는지. 둘 다 'YYYY-MM-DD'(달력 날짜, 시간 없음).
 * 음수가 나올 일은 없어야 하지만(week_of 는 항상 과거/오늘) 방어적으로 0 이상만 반환.
 */
export function daysSinceWeekOf(weekOf: string, todayKst: string): number {
  const [wy, wm, wd] = weekOf.split('-').map(Number)
  const [ty, tm, td] = todayKst.split('-').map(Number)
  const weekOfMs = Date.UTC(wy, wm - 1, wd)
  const todayMs = Date.UTC(ty, tm - 1, td)
  const diff = Math.round((todayMs - weekOfMs) / (24 * 60 * 60 * 1000))
  return Math.max(0, diff)
}

/** 슬라이딩 윈도우 시작 인덱스 — 하루에 1칸씩 밀리는 원형(wrap-around) 오프셋. */
export function computeRotationStart(weekOf: string, todayKst: string, poolSize: number): number {
  if (poolSize <= 0) return 0
  const days = daysSinceWeekOf(weekOf, todayKst)
  return days % poolSize
}

/**
 * 풀에서 start 부터 원형으로 count 건 선택. 풀이 count 이하면 로테이션 없이 전체 반환(§2 폴백).
 */
export function pickRotatedCards<T>(pool: readonly T[], start: number, count: number): T[] {
  if (pool.length <= count) return [...pool]
  const result: T[] = []
  for (let i = 0; i < count; i++) {
    result.push(pool[(start + i) % pool.length])
  }
  return result
}
