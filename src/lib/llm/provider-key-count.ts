import 'server-only'

import type { LlmProvider } from '@/lib/llm/types'

/** provider가 자체 env 파싱으로 확인한 등록 키 개수를 안전한 정수로 정규화한다. */
export function getProviderKeyCount(provider: LlmProvider): number {
  const count = provider.getKeyCount()
  return Number.isSafeInteger(count) && count > 0 ? count : 0
}
