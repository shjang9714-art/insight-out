import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'

export const metadata: Metadata = {
  title: '어드민 | Insight Out',
  description: 'Insight Out 관리자 페이지',
}

const NAV_ITEMS = [
  { href: '/admin',             label: '어드민 홈' },
  { href: '/admin/contents',    label: '콘텐츠 관리' },
  { href: '/admin/upload',      label: '리포트 업로드' },
  { href: '/admin/sources',     label: '소스 관리' },
  { href: '/admin/keywords',    label: '서비스 키워드' },
  { href: '/admin/keyword-groups', label: '토픽 규칙' },
  { href: '/admin/crawl-logs',  label: '크롤링 현황' },
  { href: '/admin/briefings',   label: '모닝브리핑' },
  { href: '/admin/translation', label: '번역 상태' },
  { href: '/admin/users',       label: '사용자 관리' },
  { href: '/admin/newsletter',  label: '뉴스레터' },
]

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
          <AdminNav items={NAV_ITEMS} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
