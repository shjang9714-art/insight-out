import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getFeedOnboardingStatus, getUserFeedCategories } from '@/lib/preferences'
import { isB2BRelevant } from '@/lib/feed-blocklist'
import { dedupSimilarItems } from '@/lib/feed-dedup'
import OnboardingCategoryPrompt from './OnboardingCategoryPrompt'
import RecommendedFeed, { type FeedItem } from './RecommendedFeed'

const FALLBACK_SELECT =
  'id, title, summary_ko, body_original, category, published_at, thumbnail_url, sources(name), matched_groups, matched_keywords'

/** 최근 N일 경계 ISO 문자열 (컴포넌트 밖에서 계산해 purity 규칙 회피) */
function recentSinceISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** 홈 "최근 피드" 슬롯 — 신규/스킵/기존 상태에 따라 분기 렌더링하는 서버 컴포넌트. */
export default async function FeedSlot() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) return null // 미들웨어가 비로그인 접근을 막지만, 타입 안전성을 위해 가드

  const status = await getFeedOnboardingStatus(supabase, user.id)

  if (status === 'new') {
    return <OnboardingCategoryPrompt />
  }

  // 카테고리 프리필 + 폴백 콘텐츠는 서로 독립 — 병렬.
  const fbRecentSince = recentSinceISO(5)
  const [categoryKeys, { data: fbRaw }] = await Promise.all([
    getUserFeedCategories(supabase, user.id),
    supabase
      .from('contents')
      .select(FALLBACK_SELECT)
      .eq('status', 'published')
      .neq('category', '유튜브')
      .gte('published_at', fbRecentSince)
      .order('published_at', { ascending: false })
      .limit(18),
  ])

  const fbFiltered = ((fbRaw ?? []) as unknown as FeedItem[]).filter((c) =>
    isB2BRelevant(c.title, c.summary_ko)
  )
  const fallbackItems = dedupSimilarItems(fbFiltered).slice(0, 6)

  return (
    <RecommendedFeed
      fallbackTrending={status === 'skipped'}
      initialCategoryKeys={categoryKeys}
      fallbackItems={fallbackItems}
    />
  )
}
