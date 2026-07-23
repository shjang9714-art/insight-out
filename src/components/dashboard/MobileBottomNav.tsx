'use client'

import Link from 'next/link'
import { Building2, FileText, Home, Layers, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { isTabActive } from '@/components/dashboard/DashboardHeader'
import { cn } from '@/lib/utils'

const MOBILE_TABS = [
  { label: '홈', href: '/dashboard', exact: true, icon: Home, isFab: false },
  { label: 'AI 인사이트', href: '/dashboard/issues', exact: false, icon: Layers, isFab: false },
  { label: '검색', href: '/dashboard/search', exact: false, icon: Search, isFab: true },
  { label: '기업동향', href: '/dashboard/entities', exact: false, icon: Building2, isFab: false },
  { label: '리포트', href: '/dashboard/reports', exact: false, icon: FileText, isFab: false },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="모바일 주 메뉴"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:hidden print:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {MOBILE_TABS.map((tab) => {
          const active = isTabActive(tab.href, tab.exact, pathname)
          const Icon = tab.icon

          if (tab.isFab) {
            return (
              // prefetch-ok: 모바일 주 네비 — 개수 고정, 이동 잦음
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="relative -top-3 flex min-w-0 flex-col items-center justify-start gap-1"
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-background transition-colors',
                    active ? 'bg-brand-700' : 'hover:bg-brand-700'
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className={cn('text-[10px] font-semibold', active ? 'text-brand-600' : 'text-foreground')}>
                  {tab.label}
                </span>
              </Link>
            )
          }

          return (
            // prefetch-ok: 모바일 주 네비 — 개수 고정, 이동 잦음
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                active ? 'text-brand-600' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="max-w-full truncate">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
