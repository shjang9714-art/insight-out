/** KST 기준 오늘 0시를 UTC ISO 문자열로 반환 */
export function getKstTodayStartIso(): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const midnightUtc =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    9 * 60 * 60 * 1000
  return new Date(midnightUtc).toISOString()
}
