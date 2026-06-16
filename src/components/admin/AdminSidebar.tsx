'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_GROUPS, ADMIN_NAV_BOTTOM } from '@/lib/admin/nav'

export function AdminSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className="sticky top-0 h-screen w-[232px] shrink-0 overflow-y-auto border-r border-border bg-card flex flex-col">
      {/* 로고 */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <span className="font-bold text-foreground">Insight Out</span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-brand-600 text-white">
          어드민
        </span>
      </div>

      {/* 섹션 스크롤 영역 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.group}>
            <p className="mb-1 px-2 text-xs text-muted-foreground/60">
              {group.group}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm opacity-60 cursor-default text-muted-foreground">
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                }
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                        active
                          ? 'bg-accent text-brand-600 font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 시스템 그룹 */}
      <div className="px-2 pb-3 border-t border-border pt-3">
        <p className="mb-1 px-2 text-xs text-muted-foreground/60">
          {ADMIN_NAV_BOTTOM.group}
        </p>
        <ul className="space-y-0.5">
          {ADMIN_NAV_BOTTOM.items.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent text-brand-600 font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
