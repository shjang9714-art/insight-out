// 홈 "핵심 인사이트" 3건 랜덤 로테이션(§3) — 매 요청마다 셔플하면 새로고침마다 바뀌어 산만하므로
// 날짜(KST) 시드로 하루 단위 고정 셔플. 같은 날 재방문 시 항상 동일한 3건이 나온다.

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

/** items 를 seed 기준으로 결정적으로 셔플해 최대 count 개를 반환. */
export function pickSeededRandom<T>(items: readonly T[], count: number, seed: string): T[] {
  const rand = mulberry32(hashSeed(seed))
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}
