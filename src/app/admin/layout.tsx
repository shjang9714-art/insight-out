import type { Metadata } from 'next'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminThemeScope } from '@/components/admin/AdminThemeScope'

export const metadata: Metadata = {
  title: '어드민 | Insight Out',
  description: 'Insight Out 관리자 페이지',
  icons: {
    icon: [{ url: '/admin/icon.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/admin/icon.png',
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeScope>
      <AdminSidebar />
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </AdminThemeScope>
  )
}
