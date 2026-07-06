export type AdminFontScale = 'compact' | 'normal' | 'roomy'
export type AdminFontFamily = 'pretendard' | 'system'
export type AdminAccentId = 'pink' | 'blue' | 'violet' | 'emerald'

export interface AdminAccentPreset {
  id: AdminAccentId
  label: string
  light: { 600: string; 700: string }
  dark: { 600: string; 700: string }
}

export const ACCENT_PRESETS: AdminAccentPreset[] = [
  {
    id: 'pink',
    label: '핑크(기본)',
    light: { 600: '#DB0078', 700: '#C00068' },
    dark: { 600: '#E6007E', 700: '#FF2C9C' },
  },
  {
    id: 'blue',
    label: '블루',
    light: { 600: '#2563EB', 700: '#1D4ED8' },
    dark: { 600: '#3B82F6', 700: '#60A5FA' },
  },
  {
    id: 'violet',
    label: '바이올렛',
    light: { 600: '#7C3AED', 700: '#6D28D9' },
    dark: { 600: '#8B5CF6', 700: '#A78BFA' },
  },
  {
    id: 'emerald',
    label: '에메랄드',
    light: { 600: '#059669', 700: '#047857' },
    dark: { 600: '#10B981', 700: '#34D399' },
  },
]

export const FONT_SCALE_OPTIONS: { id: AdminFontScale; label: string; ratio: number }[] = [
  { id: 'compact', label: '작게', ratio: 0.92 },
  { id: 'normal', label: '기본', ratio: 1 },
  { id: 'roomy', label: '크게', ratio: 1.08 },
]

export const FONT_FAMILY_OPTIONS: { id: AdminFontFamily; label: string }[] = [
  { id: 'pretendard', label: '프리텐다드(기본)' },
  { id: 'system', label: '시스템 기본' },
]

export const DEFAULT_FONT_SCALE: AdminFontScale = 'normal'
export const DEFAULT_FONT_FAMILY: AdminFontFamily = 'pretendard'
export const DEFAULT_ACCENT: AdminAccentId = 'pink'

export function getAccentPreset(id: string): AdminAccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0]
}

export function getFontScaleRatio(id: string): number {
  return FONT_SCALE_OPTIONS.find((o) => o.id === id)?.ratio ?? 1
}
