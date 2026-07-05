import { createClient } from '@/lib/supabase/server'
import {
  getFeedOnboardingStatus,
  getUserPreferenceKeywordIds,
  getUserPrimaryServiceId,
} from '@/lib/preferences'
import { isB2BRelevant } from '@/lib/feed-blocklist'
import { dedupSimilarItems } from '@/lib/feed-dedup'
import OnboardingKeywordPicker from './OnboardingKeywordPicker'
import RecommendedFeed, { type FeedItem } from './RecommendedFeed'

interface ServiceRow {
  id: string
  name: string
}

const FALLBACK_SELECT =
  'id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords'

/** 최근 N일 경계 ISO 문자열 (컴포넌트 밖에서 계산해 purity 규칙 회피) */
function recentSinceISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
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

  // 폴백 페치: 피드가 비었을 때 사용할 최신 콘텐츠 (발행 5일 이내, 최신순)
  const fbRecentSince = recentSinceISO(5)
  const { data: fbRaw } = await supabase
    .from('contents')
    .select(FALLBACK_SELECT)
    .eq('status', 'published')
    .neq('category', '유튜브')
    .gte('published_at', fbRecentSince)
    .order('published_at', { ascending: false })
    .limit(18)

  const fbFiltered = ((fbRaw ?? []) as unknown as FeedItem[])
    .filter((c) => isB2BRelevant(c.title, c.summary_ko))
  const fallbackItems = dedupSimilarItems(fbFiltered).slice(0, 6)

  return (
    <RecommendedFeed
      services={services}
      fallbackTrending={status === 'skipped'}
      initialServiceId={primaryServiceId}
      initialKeywordIds={keywordIds}
      initialKeywordMap={keywordNameById}
      fallbackItems={fallbackItems}
    />
  )
}
