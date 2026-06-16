import { createClient } from '@/lib/supabase/server'
import {
  getFeedOnboardingStatus,
  getUserPreferenceKeywordIds,
  getUserPrimaryServiceId,
} from '@/lib/preferences'
import OnboardingKeywordPicker from './OnboardingKeywordPicker'
import RecommendedFeed from './RecommendedFeed'

interface ServiceRow {
  id: string
  name: string
}

/** 홈 "최근 피드" 슬롯 — 신규/스킵/기존 상태에 따라 분기 렌더링하는 서버 컴포넌트. */
export default async function FeedSlot() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // 미들웨어가 비로그인 접근을 막지만, 타입 안전성을 위해 가드

  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name')
    .order('order')
  const services = (servicesData ?? []) as ServiceRow[]

  const status = await getFeedOnboardingStatus(supabase, user.id)

  if (status === 'new') {
    return <OnboardingKeywordPicker services={services} mode="onboarding" />
  }

  const [keywordIds, primaryServiceId] = await Promise.all([
    getUserPreferenceKeywordIds(supabase, user.id),
    getUserPrimaryServiceId(supabase, user.id),
  ])

  let keywordNameById: Record<string, string> = {}
  if (keywordIds.length > 0) {
    const { data: keywordRows } = await supabase
      .from('keywords')
      .select('id, name')
      .in('id', keywordIds)
    keywordNameById = Object.fromEntries(
      ((keywordRows ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name])
    )
  }

  return (
    <RecommendedFeed
      services={services}
      fallbackTrending={status === 'skipped'}
      initialServiceId={primaryServiceId}
      initialKeywordIds={keywordIds}
      initialKeywordMap={keywordNameById}
    />
  )
}
