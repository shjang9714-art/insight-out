import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import PageContainer from '@/components/PageContainer'
import LabBoard, { LAB_VIEW_IDS, type LabViewId } from '@/components/analysis/LabBoard'
import { getLabData } from '@/lib/lab/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '실험실 | Insight Out',
  description: '관리자 전용 — 숨김 처리된 하위 카테고리를 확인하는 페이지.',
}

type SearchParams = Promise<{ view?: string }>

export default async function LabPage({ searchParams }: { searchParams: SearchParams }) {
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

  // 방어적 이중 체크 — 실제 차단은 middleware.ts 에서 수행(빌드 매니페스트 등록 검증 필수).
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const raw = typeof params.view === 'string' ? params.view : ''
  const view: LabViewId = (LAB_VIEW_IDS.includes(raw as LabViewId) ? raw : 'headline') as LabViewId

  const labData = await getLabData(supabase)

  return (
    <PageContainer>
      <Suspense fallback={
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          로딩 중...
        </div>
      }>
        <LabBoard initialView={view} {...labData} />
      </Suspense>
    </PageContainer>
  )
}
