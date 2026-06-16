import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'
import { ADMIN_NAV_GROUPS } from '@/lib/admin/nav'

export const metadata: Metadata = {
  title: '어드민 | Insight Out',
  description: 'Insight Out 관리자 페이지',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <span className="font-bold text-foreground">Insight Out</span>
            <span className="text-muted-foreground/30 text-sm">·</span>
            <span className="text-sm font-medium text-brand-600">어드민</span>
          </Link>
          <AdminNav groups={ADMIN_NAV_GROUPS.map(g => ({
            group: g.group,
            items: g.items.map(({ href, label }) => ({ href, label })),
          }))} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
