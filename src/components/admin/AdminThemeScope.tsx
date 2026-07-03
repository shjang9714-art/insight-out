'use client'

import { createContext, startTransition, useContext, useEffect, useState } from 'react'

type AdminTheme = 'light' | 'dark'

const STORAGE_KEY = 'io:admin-theme'

const AdminThemeContext = createContext<{ theme: AdminTheme; toggle: () => void } | null>(null)

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext)
  if (!ctx) throw new Error('useAdminTheme은 AdminThemeScope 내부에서만 사용할 수 있습니다.')
  return ctx
}

/**
 * 어드민 전용 테마 스코프. 전역 next-themes(html.dark)와 독립적으로
 * localStorage(io:admin-theme)만 따른다. 기본 라이트로 즉시 렌더 후
 * 마운트 시 저장값을 반영 — 다크 저장자만 짧게 깜빡일 수 있음(허용).
 */
export function AdminThemeScope({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>('light')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') {
      startTransition(() => setTheme(saved))
    }
  }, [])

  const toggle = () => {
    setTheme((prev) => {
      const next: AdminTheme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <AdminThemeContext.Provider value={{ theme, toggle }}>
      <div className="admin-scope flex min-h-screen bg-background" data-admin-theme={theme}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  )
}
