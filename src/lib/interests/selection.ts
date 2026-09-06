import type { LensKey } from '@/lib/lens'
import type { InterestKind } from '@/lib/interests/mutations'
import { createClient } from '@/lib/supabase/client'

export interface SelectionToggleResult {
  nextSelectedKeys: string[]
  nextLens?: LensKey
  /** 이번 토글이 선택을 켰는지 — 켤 때만 사용 기록 대상이다. */
  turnedOn: boolean
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
    return { nextSelectedKeys, nextLens: 'boost', turnedOn: true }
  }
  if (isSelected && nextSelectedKeys.length === 0 && activeLens !== 'all') {
    return { nextSelectedKeys, nextLens: 'all', turnedOn: false }
  }
  return { nextSelectedKeys, turnedOn: !isSelected }
}

/**
 * 선택을 켤 때만 호출한다 — 정렬 보조 데이터(고정·최근 사용·빈도)라 판정에는 영향이 없다.
 * fire-and-forget: await 하지 않고, 실패해도 사용자를 막지 않는다.
 * invalidateLensContext() 는 부르지 않는다 — 다음 로드에 반영되면 충분하고,
 * 여기서 무효화하면 클릭마다 렌즈 전체가 재조회된다.
 */
export function recordInterestUse(key: string): void {
  const [kind, targetId] = key.split(':') as [InterestKind, string]
  const supabase = createClient()
  void supabase
    .rpc('touch_user_interest', { p_kind: kind, p_target_id: targetId })
    .then(({ error }) => {
      if (error) console.warn('[interests] 사용 기록 실패:', error.message)
    })
}
