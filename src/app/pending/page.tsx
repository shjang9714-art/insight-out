import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PendingStatus from '@/components/pending/PendingStatus'

export const metadata: Metadata = {
  title: '승인 대기 | Insight Out',
  description: '가입 승인 대기 안내 페이지입니다.',
}

export default async function PendingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('approval_status')
    .eq('id', user.id)
    .single()

  const status = (profile?.approval_status as 'pending' | 'rejected') ?? 'pending'

  return <PendingStatus status={status} />
}
