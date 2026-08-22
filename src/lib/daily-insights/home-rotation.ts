// 홈 "핵심 인사이트" 3건 스텝-윈도우 로테이션(§20260822) — 순수 랜덤 셔플(pickSeededRandom, 폐기)은
// 인접일 3장 중 다수가 우연히 겹쳐 "며칠째 안 바뀌는" 체감을 낳았다. 대신 그 주(week_of) 시드로
// pool 순서를 한 번만 고정 셔플한 뒤, 날짜가 바뀔 때마다 윈도우를 count 칸씩 밀어 인접일이
// 겹치지 않게 한다. 같은 날 재방문 시 항상 동일한 count 건이 나온다.

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  }
  return h >>> 0
}

/** mulberry32 — 시드 고정 의사난수. 암호학적 용도 아님(단순 셔플용). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleDeterministic<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed))
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * items(호출측에서 안정적 기준으로 정렬해 전달, 예: id 순) 를 weekSeed 로 한 번 셔플해 그 주 동안
 * 고정된 순서를 만들고, daysSinceWeekOf * count 칸만큼 윈도우를 이동해 count 건을 뽑는다.
 * - pool 이 count 이하면 로테이션 없이 셔플된 전체를 그대로 반환(기존 폴백 유지).
 * - pool 이 count*2 이상이면 인접일(day, day+1) 사이 겹침이 수학적으로 0이다.
 * - count*2 미만(예: count=3, pool 4~5)이면 완전 무겹침은 불가능해 best-effort(최소 겹침)로 동작한다.
 * - 같은 daysSinceWeekOf 값이면 항상 동일한 결과(결정론), KST 자정에 daysSinceWeekOf 가 바뀌며 교체된다.
 */
export function pickRotatedWindow<T>(
  items: readonly T[],
  count: number,
  weekSeed: string,
  daysSinceWeekOf: number
): T[] {
  const poolSize = items.length
  if (poolSize === 0) return []

  const shuffled = shuffleDeterministic(items, weekSeed)
  if (poolSize <= count) return shuffled

  const start = (((daysSinceWeekOf * count) % poolSize) + poolSize) % poolSize
  const result: T[] = []
  for (let i = 0; i < count; i++) {
    result.push(shuffled[(start + i) % poolSize])
  }
  return result
}
