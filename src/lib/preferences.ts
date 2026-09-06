import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeCategoryKeys } from '@/lib/feed/categories'
import { GROUP_KIND_TO_FEED_CATEGORY } from '@/lib/interests/feed-category-map'

export type FeedOnboardingStatus = 'new' | 'skipped' | 'existing'

/**
 * 관심사(user_interests 의 topic)에서 파생된 피드 카테고리 키.
 * keyword_groups.kind → GROUP_KIND_TO_FEED_CATEGORY 매핑, 대응 없는 kind 는 버린다.
 */
async function deriveInterestFeedCategories(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data: interestRows, error: interestError } = await supabase
    .from('user_interests')
    .select('group_id')
    .eq('user_id', userId)
    .eq('kind', 'topic')

  if (interestError) return []

  const groupIds = Array.from(new Set(
    ((interestRows ?? []) as { group_id: string | null }[])
      .map(row => row.group_id)
      .filter((id): id is string => Boolean(id)),
  ))
  if (groupIds.length === 0) return []

  const { data: groupRows, error: groupError } = await supabase
    .from('keyword_groups')
    .select('kind')
    .in('id', groupIds)

  if (groupError) return []

  return ((groupRows ?? []) as { kind: string }[])
    .map(row => GROUP_KIND_TO_FEED_CATEGORY[row.kind])
    .filter((key): key is string => Boolean(key))
}

/** 저장된 feed_categories ∪ 관심사 파생분 — 합집합, 중복 제거 후 정제. */
async function resolveFeedCategoryKeys(
  supabase: SupabaseClient,
  userId: string,
  storedKeys: string[],
): Promise<string[]> {
  const derivedKeys = await deriveInterestFeedCategories(supabase, userId)
  return sanitizeCategoryKeys(Array.from(new Set([...storedKeys, ...derivedKeys])))
}

/**
 * 홈 피드 슬롯 상태 판정.
 * 우선순위: 기존(카테고리 1개 이상 선택) → 스킵(skipped=true) → 신규.
 * feed_categories 적재 자체가 "사용자가 명시적으로 선택했다"는 가장 강한 신호이므로
 * skipped 플래그보다 우선한다. bootstrap이 skipped 리셋에 실패해도(네트워크 오류 등)
 * 카테고리는 이미 저장됐으므로 'existing'으로 정상 분기된다.
 * 관심사에서 파생된 카테고리가 있어도 '이미 개인화됨'으로 본다(615).
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
  const keys = await resolveFeedCategoryKeys(supabase, userId, row?.feed_categories ?? [])

  if (keys.length >= 1) return 'existing'
  if (skipped) return 'skipped'
  return 'new'
}

/** 현재 사용자가 선택한 추천 카테고리 키 목록(저장분 ∪ 관심사 파생분). 편집 진입 시 프리필용. */
export async function getUserFeedCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('feed_categories')
    .eq('id', userId)
    .single()

  const storedKeys = (data as { feed_categories: string[] } | null)?.feed_categories ?? []
  return resolveFeedCategoryKeys(supabase, userId, storedKeys)
}
