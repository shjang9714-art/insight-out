'use client'

import { Moon, Sun } from 'lucide-react'
import { useAdminTheme } from '@/components/admin/AdminThemeScope'

export function AdminThemeToggle() {
  const { theme, toggle } = useAdminTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      className="admin-sidebar-menu flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
      )}
      {theme === 'dark' ? '라이트' : '다크'}
    </button>
  )
}
