import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { fetchIssueActivity } from '@/lib/issues/activity'
import IssueBoardClient from '@/components/issues/IssueBoardClient'

export default async function IssueBoardView() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const cards = await fetchIssueActivity(supabase)

  return <IssueBoardClient cards={cards} />
}
