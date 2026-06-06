import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '어드민 | Insight Out',
  description: 'Insight Out 관리자 페이지',
}

const NAV_ITEMS = [
  { href: '/admin',            label: '어드민 홈' },
  { href: '/admin/contents',   label: '콘텐츠 관리' },
  { href: '/admin/upload',     label: '리포트 업로드' },
  { href: '/admin/sources',    label: '소스 관리' },
  { href: '/admin/keywords',   label: '키워드 관리' },
  { href: '/admin/crawl-logs', label: '크롤링 현황' },
  { href: '/admin/translation', label: '번역 상태' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <span className="font-bold text-gray-900">Insight Out</span>
            <span className="text-gray-300 text-sm">·</span>
            <span className="text-sm font-medium text-brand-600">어드민</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
