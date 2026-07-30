export const DEFAULT_MONTHLY_TOKEN_LIMIT = 1_000_000

/** provider 키 개수를 반영한 월간 실효 토큰 한도를 계산한다. */
export function effectiveTokenLimit(
  settingLimit: number | null | undefined,
  keyCount: number
): number {
  return (settingLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT) * keyCount
}
