const STORAGE_KEY = 'io:recent-views'
const MAX_ITEMS = 8

export interface RecentView {
  id: string
  title: string
  category: string | null
  viewedAt: number
}

export function addRecentView(v: RecentView): void {
  if (typeof window === 'undefined') return
  const current = getRecentViews()
  const filtered = current.filter((item) => item.id !== v.id)
  const updated = [v, ...filtered].slice(0, MAX_ITEMS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  window.dispatchEvent(new CustomEvent('recent-views:changed'))
}

export function getRecentViews(): RecentView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentView[]
  } catch {
    return []
  }
}
