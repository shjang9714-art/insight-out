'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_GROUPS, ADMIN_NAV_BOTTOM } from '@/lib/admin/nav'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState('')

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const trimmedQuery = query.trim().toLowerCase()

  const allItems = [
    ...ADMIN_NAV_GROUPS,
    ADMIN_NAV_BOTTOM,
  ].flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })))

  const searchResults = trimmedQuery
    ? allItems.filter(
        (it) =>
          !it.disabled &&
          (it.label.toLowerCase().includes(trimmedQuery) ||
            it.description.toLowerCase().includes(trimmedQuery))
      )
    : []

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchResults.length > 0) {
      router.push(searchResults[0].href)
      setQuery('')
    }
  }

  return (
    <aside className="sticky top-0 h-screen w-[288px] shrink-0 overflow-y-auto border-r border-border bg-card flex flex-col">
      {/* 로고 */}
      <Link
        href="/admin"
        className="flex items-center gap-2 px-4 py-4 border-b border-border transition-colors hover:bg-accent/50"
      >
        <span className="text-xl font-bold text-foreground">Insight Out</span>
        <span className="admin-badge rounded px-1.5 py-0.5 bg-brand-600 text-white">
          어드민
        </span>
      </Link>

      {/* 메뉴 검색 */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="메뉴 검색"
            placeholder="메뉴 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>
      </div>

      {/* 섹션 스크롤 영역 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {trimmedQuery ? (
          /* 검색 결과 (평면 리스트) */
          searchResults.length > 0 ? (
            <ul className="space-y-0.5">
              {searchResults.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setQuery('')}
                      className={cn(
                        'admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition-colors',
                        active
                          ? 'bg-accent text-brand-600 font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      <span className="admin-caption rounded px-1.5 py-0.5 text-muted-foreground bg-muted">
                        {item.group}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <AdminEmptyState
              message="일치하는 메뉴가 없습니다."
              className="p-4 rounded-lg"
            />
          )
        ) : (
          /* 기본 그룹 네비 */
          ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="admin-sidebar-group mb-1 px-2 text-muted-foreground/80">
                {group.group}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  if (item.disabled) {
                    return (
                      <li key={item.href}>
                        <span className="admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 opacity-70 cursor-default text-muted-foreground">
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {item.badge && (
                            <span className="admin-caption rounded px-1.5 py-0.5 font-medium bg-muted text-muted-foreground">
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
                          'admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition-colors',
                          active
                            ? 'bg-accent text-brand-600 font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* 하단 시스템 그룹 */}
      <div className="px-2 pb-3 border-t border-border pt-3">
        <p className="admin-sidebar-group mb-1 px-2 text-muted-foreground/80">
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
                    'admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition-colors',
                    active
                      ? 'bg-accent text-brand-600 font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="mt-1 border-t border-border pt-1">
          <AdminThemeToggle />
        </div>
      </div>
    </aside>
  )
}
