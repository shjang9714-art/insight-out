import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import CouncilWorkspace from '@/components/dashboard/CouncilWorkspace'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI 협의체 | Insight Out',
  description:
    'MI(마켓 인텔리전스) 관점의 페르소나로 토론하고 인사이트를 얻는 AI 협의체.',
}

export default async function CouncilPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <PageContainer>
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        <CouncilWorkspace />
      </Suspense>
    </PageContainer>
  )
}
