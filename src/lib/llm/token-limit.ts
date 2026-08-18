export const DEFAULT_MONTHLY_TOKEN_LIMIT = 1_000_000

/** provider의 월간 사용 예산. 제공사 한도가 아니라 자체 월 예산이며 키 개수와 무관하다. */
export function monthlyBudget(settingLimit: number | null | undefined): number {
  return settingLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT
}
