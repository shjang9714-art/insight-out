import type { LensKey } from '@/lib/lens'

export interface SelectionToggleResult {
  nextSelectedKeys: string[]
  nextLens?: LensKey
}

/**
 * 관심사 선택 토글 + 렌즈 상태 전이 (612 §4-1 표) — 사이드바·Drawer 공용.
 * 「전체 보기」에서 첫 선택 → boost 자동 전환, 마지막 선택 해제 → all 자동 전환.
 */
export function toggleInterestSelection(
  key: string,
  selectedKeys: string[],
  activeLens: LensKey,
): SelectionToggleResult {
  const isSelected = selectedKeys.includes(key)
  const nextSelectedKeys = isSelected
    ? selectedKeys.filter(existing => existing !== key)
    : [...selectedKeys, key]

  if (!isSelected && activeLens === 'all') {
    return { nextSelectedKeys, nextLens: 'boost' }
  }
  if (isSelected && nextSelectedKeys.length === 0 && activeLens !== 'all') {
    return { nextSelectedKeys, nextLens: 'all' }
  }
  return { nextSelectedKeys }
}
