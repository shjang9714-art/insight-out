import type { SupabaseClient } from '@supabase/supabase-js'

export type FeedOnboardingStatus = 'new' | 'skipped' | 'existing'

export const MIN_ONBOARDING_KEYWORDS = 3
export const MAX_ONBOARDING_KEYWORDS = 10

/**
 * 홈 피드 슬롯 상태 판정.
 * 우선순위: 기존(선호 1건 이상) → 스킵(skipped=true) → 신규.
 * user_preferences 적재 자체가 "사용자가 명시적으로 선택했다"는 가장 강한 신호이므로
 * skipped 플래그보다 우선한다. bootstrap이 skipped 리셋에 실패해도(네트워크 오류 등)
 * 키워드는 이미 저장됐으므로 'existing'으로 정상 분기된다.
 */
export async function getFeedOnboardingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<FeedOnboardingStatus> {
  const [{ data: userRow }, { count }] = await Promise.all([
    supabase.from('users').select('feed_onboarding_skipped').eq('id', userId).single(),
    supabase
      .from('user_preferences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  const skipped = (userRow as { feed_onboarding_skipped: boolean } | null)?.feed_onboarding_skipped ?? false
  const preferenceCount = count ?? 0

  if (preferenceCount >= 1) return 'existing'
  if (skipped) return 'skipped'
  return 'new'
}

/** 현재 사용자의 키워드 선호(user_preferences) id 목록. 편집 진입 시 프리필용. */
export async function getUserPreferenceKeywordIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('user_preferences')
    .select('keyword_id')
    .eq('user_id', userId)

  return ((data ?? []) as { keyword_id: string }[]).map((row) => row.keyword_id)
}

/** 가중치가 가장 높은 서비스 선호(user_service_prefs) 1건. 편집 진입 시 활성 탭 프리필용. */
export async function getUserPrimaryServiceId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_service_prefs')
    .select('service_id')
    .eq('user_id', userId)
    .order('weight', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as { service_id: string } | null)?.service_id ?? null
}
