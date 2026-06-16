'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
interface NavItem {
  href: string
  label: string
}

interface NavGroup {
  group: string
  items: NavItem[]
}

export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center overflow-x-auto">
      {groups.map((g, gi) => (
        <span key={g.group} className="flex items-center">
          {gi > 0 && (
            <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
          )}
          {g.items.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-accent font-semibold text-brand-600'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </span>
      ))}
    </nav>
  )
}
