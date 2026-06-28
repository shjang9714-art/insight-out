import { createClient } from '@/lib/supabase/server'
import { getFeedOnboardingStatus, getUserPrimaryServiceId } from '@/lib/preferences'
import PersonalizationNudgeBanner from './PersonalizationNudgeBanner'

export default async function PersonalizationNudge() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const status = await getFeedOnboardingStatus(supabase, user.id)
  if (status === 'new') return null

  const [serviceId, watchRes] = await Promise.all([
    getUserPrimaryServiceId(supabase, user.id),
    supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const noService = !serviceId
  const noWatchlist = (watchRes.count ?? 0) === 0
  if (!noService && !noWatchlist) return null

  return <PersonalizationNudgeBanner noService={noService} noWatchlist={noWatchlist} />
}
