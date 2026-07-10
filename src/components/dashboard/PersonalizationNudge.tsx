import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getFeedOnboardingStatus, getUserFeedCategories } from '@/lib/preferences'
import PersonalizationNudgeBanner from './PersonalizationNudgeBanner'

export default async function PersonalizationNudge() {
  const user = await getCachedUser()
  if (!user) return null

  const supabase = await createClient()

  const status = await getFeedOnboardingStatus(supabase, user.id)
  if (status === 'new') return null

  const [categoryKeys, watchRes] = await Promise.all([
    getUserFeedCategories(supabase, user.id),
    supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const noCategories = categoryKeys.length === 0
  const noWatchlist = (watchRes.count ?? 0) === 0
  if (!noCategories && !noWatchlist) return null

  return <PersonalizationNudgeBanner noCategories={noCategories} noWatchlist={noWatchlist} />
}
