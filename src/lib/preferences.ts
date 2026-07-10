import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeCategoryKeys } from '@/lib/feed/categories'

export type FeedOnboardingStatus = 'new' | 'skipped' | 'existing'

/**
 * 홈 피드 슬롯 상태 판정.
 * 우선순위: 기존(카테고리 1개 이상 선택) → 스킵(skipped=true) → 신규.
 * feed_categories 적재 자체가 "사용자가 명시적으로 선택했다"는 가장 강한 신호이므로
 * skipped 플래그보다 우선한다. bootstrap이 skipped 리셋에 실패해도(네트워크 오류 등)
 * 카테고리는 이미 저장됐으므로 'existing'으로 정상 분기된다.
 */
export async function getFeedOnboardingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<FeedOnboardingStatus> {
  const { data: userRow } = await supabase
    .from('users')
    .select('feed_onboarding_skipped, feed_categories')
    .eq('id', userId)
    .single()

  const row = userRow as { feed_onboarding_skipped: boolean; feed_categories: string[] } | null
  const skipped = row?.feed_onboarding_skipped ?? false
  const categoryCount = row?.feed_categories?.length ?? 0

  if (categoryCount >= 1) return 'existing'
  if (skipped) return 'skipped'
  return 'new'
}

/** 현재 사용자가 선택한 추천 카테고리 키 목록. 편집 진입 시 프리필용. */
export async function getUserFeedCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('feed_categories')
    .eq('id', userId)
    .single()

  const keys = (data as { feed_categories: string[] } | null)?.feed_categories ?? []
  return sanitizeCategoryKeys(keys)
}
