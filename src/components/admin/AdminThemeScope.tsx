'use client'

import { createContext, startTransition, useContext, useEffect, useMemo, useState } from 'react'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  getAccentPreset,
  getFontScaleRatio,
  type AdminAccentId,
  type AdminFontFamily,
  type AdminFontScale,
} from '@/lib/admin/appearance'

type AdminTheme = 'light' | 'dark'

const THEME_KEY = 'io:admin-theme'
const FONT_SCALE_KEY = 'io:admin-font-scale'
const FONT_FAMILY_KEY = 'io:admin-font-family'
const ACCENT_KEY = 'io:admin-accent'

interface AdminAppearance {
  fontScale: AdminFontScale
  fontFamily: AdminFontFamily
  accent: AdminAccentId
}

const DEFAULT_APPEARANCE: AdminAppearance = {
  fontScale: DEFAULT_FONT_SCALE,
  fontFamily: DEFAULT_FONT_FAMILY,
  accent: DEFAULT_ACCENT,
}

interface AdminThemeContextValue {
  theme: AdminTheme
  toggle: () => void
  appearance: AdminAppearance
  setFontScale: (v: AdminFontScale) => void
  setFontFamily: (v: AdminFontFamily) => void
  setAccent: (v: AdminAccentId) => void
  reset: () => void
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null)

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext)
  if (!ctx) throw new Error('useAdminTheme은 AdminThemeScope 내부에서만 사용할 수 있습니다.')
  return ctx
}

/**
 * 어드민 전용 테마·외관 스코프. 전역 next-themes(html.dark)와 독립적으로
 * localStorage(io:admin-*)만 따른다. 기본값으로 즉시 렌더 후
 * 마운트 시 저장값을 반영 — 저장값이 있는 사용자만 짧게 깜빡일 수 있음(허용).
 */
export function AdminThemeScope({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>('light')
  const [appearance, setAppearance] = useState<AdminAppearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY)
      const savedFontScale = localStorage.getItem(FONT_SCALE_KEY)
      const savedFontFamily = localStorage.getItem(FONT_FAMILY_KEY)
      const savedAccent = localStorage.getItem(ACCENT_KEY)

      startTransition(() => {
        if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
        setAppearance((prev) => ({
          fontScale:
            savedFontScale === 'compact' || savedFontScale === 'normal' || savedFontScale === 'roomy'
              ? savedFontScale
              : prev.fontScale,
          fontFamily:
            savedFontFamily === 'pretendard' || savedFontFamily === 'system' ? savedFontFamily : prev.fontFamily,
          accent: (ACCENT_PRESETS.some((p) => p.id === savedAccent) ? savedAccent : prev.accent) as AdminAccentId,
        }))
      })
    } catch {
      // localStorage 접근 불가 — 기본값 유지
    }
  }, [])

  const toggle = () => {
    setTheme((prev) => {
      const next: AdminTheme = prev === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // 저장 불가 — 세션 내 상태만 반영
      }
      return next
    })
  }

  const setFontScale = (v: AdminFontScale) => {
    setAppearance((prev) => ({ ...prev, fontScale: v }))
    try {
      localStorage.setItem(FONT_SCALE_KEY, v)
    } catch {
      // 저장 불가 — 세션 내 상태만 반영
    }
  }

  const setFontFamily = (v: AdminFontFamily) => {
    setAppearance((prev) => ({ ...prev, fontFamily: v }))
    try {
      localStorage.setItem(FONT_FAMILY_KEY, v)
    } catch {
      // 저장 불가 — 세션 내 상태만 반영
    }
  }

  const setAccent = (v: AdminAccentId) => {
    setAppearance((prev) => ({ ...prev, accent: v }))
    try {
      localStorage.setItem(ACCENT_KEY, v)
    } catch {
      // 저장 불가 — 세션 내 상태만 반영
    }
  }

  const reset = () => {
    setAppearance(DEFAULT_APPEARANCE)
    try {
      localStorage.removeItem(FONT_SCALE_KEY)
      localStorage.removeItem(FONT_FAMILY_KEY)
      localStorage.removeItem(ACCENT_KEY)
    } catch {
      // 저장 불가 — 세션 내 상태만 반영
    }
  }

  const scopeStyle = useMemo(() => {
    const accentPreset = getAccentPreset(appearance.accent)
    const accentPair = theme === 'dark' ? accentPreset.dark : accentPreset.light
    const style: Record<string, string> = {
      '--admin-font-scale': String(getFontScaleRatio(appearance.fontScale)),
    }
    if (appearance.fontFamily === 'system') {
      style['--admin-font-family'] = "system-ui, -apple-system, 'Segoe UI', sans-serif"
    }
    if (appearance.accent !== DEFAULT_ACCENT) {
      style['--color-brand-600'] = accentPair[600]
      style['--color-brand-700'] = accentPair[700]
    }
    return style as React.CSSProperties
  }, [theme, appearance])

  return (
    <AdminThemeContext.Provider
      value={{ theme, toggle, appearance, setFontScale, setFontFamily, setAccent, reset }}
    >
      <div
        className="admin-scope flex min-h-screen bg-background"
        data-admin-theme={theme}
        style={scopeStyle}
      >
        {children}
      </div>
    </AdminThemeContext.Provider>
  )
}
