import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminThemeScope } from '@/components/admin/AdminThemeScope'
import EnrichJobsProvider from '@/components/admin/EnrichJobsProvider'
import EnrichJobsDock from '@/components/admin/EnrichJobsDock'
import { createClient } from '@/lib/supabase/server'
import { AdminConfirmHost } from '@/components/admin/ui/AdminConfirm'

export const metadata: Metadata = {
  title: '어드민 | Insight Out',
  description: 'Insight Out 관리자 페이지',
  icons: {
    icon: [{ url: '/admin/icon.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/admin/icon.png',
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 미들웨어의 15분 프로필 캐시를 신뢰하지 않고 매번 DB에서 확인해 독립적인 방어선을 유지한다.
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <AdminThemeScope>
      <AdminConfirmHost>
      <EnrichJobsProvider>
        <Suspense fallback={null}>
          <AdminSidebar />
        </Suspense>
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
        </main>
        <EnrichJobsDock />
      </EnrichJobsProvider>
      </AdminConfirmHost>
    </AdminThemeScope>
  )
}
