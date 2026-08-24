'use client'

import Link from 'next/link'
import { Building2, FolderOpen, Hash, Home, Layers } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { NAV_TABS, resolveActiveNav } from '@/lib/nav/active'
import { cn } from '@/lib/utils'

const MOBILE_TAB_ICONS = {
  '/dashboard': Home,
  '/dashboard/issues': Layers,
  '/dashboard/issues?view=keyword': Hash,
  '/dashboard/entities': Building2,
  '/dashboard/contents': FolderOpen,
} as const

export function MobileBottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { l1Href: activeL1Href } = resolveActiveNav(pathname, searchParams)

  return (
    <nav
      aria-label="모바일 주 메뉴"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:hidden print:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {NAV_TABS.filter((tab) => tab.mobileVisible !== false).map((tab) => {
          const active = activeL1Href === tab.href
          const Icon = MOBILE_TAB_ICONS[tab.href as keyof typeof MOBILE_TAB_ICONS]

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
