// 최근 검색어 — 서버/DB 미사용, 브라우저 localStorage에만 저장(C. 최근 검색어 스펙).
// 검색이 실제로 실행될 때(엔터/제출)만 저장 — 키 입력마다 저장하지 않는다.

const STORAGE_KEY = 'io.recentSearches'
const MAX_ITEMS = 8

function readAll(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function writeAll(items: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 조용히 무시, 검색 자체는 계속 동작해야 함
  }
}

export function getRecentSearches(): string[] {
  return readAll()
}

/** 최신이 위, 중복 제거(기존 항목은 최신 위치로 이동), 최대 MAX_ITEMS개 */
export function addRecentSearch(q: string): string[] {
  const trimmed = q.trim()
  if (!trimmed) return readAll()
  const next = [trimmed, ...readAll().filter((v) => v !== trimmed)].slice(0, MAX_ITEMS)
  writeAll(next)
  return next
}

export function removeRecentSearch(q: string): string[] {
  const next = readAll().filter((v) => v !== q)
  writeAll(next)
  return next
}

export function clearRecentSearches(): string[] {
  writeAll([])
  return []
}
