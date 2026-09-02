import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getFeedOnboardingStatus, getUserFeedCategories } from '@/lib/preferences'
import { getServerLensContext } from '@/lib/lens-server'
import PersonalizationNudgeBanner from './PersonalizationNudgeBanner'

export default async function PersonalizationNudge() {
  const user = await getCachedUser()
  if (!user) return null

  const supabase = await createClient()

  const status = await getFeedOnboardingStatus(supabase, user.id)
  if (status === 'new') return null

  const [categoryKeys, lensContext] = await Promise.all([
    getUserFeedCategories(supabase, user.id),
    getServerLensContext(),
  ])

  const noCategories = categoryKeys.length === 0
  const noWatchlist = lensContext.count === 0
  if (!noCategories && !noWatchlist) return null

  return <PersonalizationNudgeBanner noCategories={noCategories} noWatchlist={noWatchlist} />
}
