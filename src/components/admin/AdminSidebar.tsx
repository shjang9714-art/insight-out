'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ChevronDown, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_GROUPS } from '@/lib/admin/nav'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'

const WIDTH_KEY = 'io-admin-sb-width'
const COLLAPSED_KEY = 'io-admin-sb-collapsed'
const FOLDED_KEY = 'io-admin-sb-folded'
const MIN_W = 220
const MAX_W = 480
const DEFAULT_W = 288
const RAIL_W = 60

function clampWidth(w: number) {
  if (!Number.isFinite(w)) return DEFAULT_W
  return Math.min(MAX_W, Math.max(MIN_W, w))
}

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [showPlanned, setShowPlanned] = useState(false)

  const [width, setWidth] = useState(DEFAULT_W)
  const [collapsed, setCollapsed] = useState(false)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  // 하이드레이션 안전 — 초기 렌더는 기본값, mount 후 localStorage 반영
  useEffect(() => {
    startTransition(() => {
      try {
        const rawWidth = window.localStorage.getItem(WIDTH_KEY)
        if (rawWidth) {
          const parsed = Number(rawWidth)
          setWidth(clampWidth(parsed))
        }
      } catch {
        // 무시 — 기본값 유지
      }
      try {
        const rawCollapsed = window.localStorage.getItem(COLLAPSED_KEY)
        if (rawCollapsed === '1') setCollapsed(true)
      } catch {
        // 무시
      }
      try {
        const rawFolded = window.localStorage.getItem(FOLDED_KEY)
        if (rawFolded) {
          const parsed: unknown = JSON.parse(rawFolded)
          if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
            setFolded(new Set(parsed))
          }
        }
      } catch {
        // 무시
      }
    })
  }, [])

  // 442: 리사이즈 드래그
  useEffect(() => {
    if (!isDragging) return

    function handleMouseMove(e: MouseEvent) {
      if (!dragState.current) return
      const next = clampWidth(dragState.current.startWidth + (e.clientX - dragState.current.startX))
      setWidth(next)
    }
    function handleMouseUp() {
      resizeHandleRef.current?.blur()
      setIsDragging(false)
      dragState.current = null
      document.body.style.userSelect = ''
      setWidth((w) => {
        try {
          window.localStorage.setItem(WIDTH_KEY, String(w))
        } catch {
          // 무시
        }
        return w
      })
    }

    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  function handleHandleMouseDown(e: React.MouseEvent) {
    if (collapsed) return
    dragState.current = { startX: e.clientX, startWidth: width }
    setIsDragging(true)
  }

  function handleHandleKeyDown(e: React.KeyboardEvent) {
    if (collapsed) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 16 : -16
      setWidth((w) => {
        const next = clampWidth(w + delta)
        try {
          window.localStorage.setItem(WIDTH_KEY, String(next))
        } catch {
          // 무시
        }
        return next
      })
    }
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // 무시
      }
      return next
    })
  }

  function toggleFolded(groupName: string) {
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      try {
        window.localStorage.setItem(FOLDED_KEY, JSON.stringify(Array.from(next)))
      } catch {
        // 무시
      }
      return next
    })
  }

  // 187: 미완료(대기+진행) 운영 요청 개수 배지 (in-admin 알림)
  const [openRequestCount, setOpenRequestCount] = useState(0)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/requests/count')
        if (!res.ok) return
        const data = await res.json() as { count: number }
        setOpenRequestCount(data.count ?? 0)
      } catch {
        // 비차단 — 배지 숨김
      }
    }
    void run()
  }, [])

  // 일일 핵심 Insight — 검토 필요(needs_review) 개수 배지 (자동게시+사후검토 알림)
  const [dailyInsightReviewCount, setDailyInsightReviewCount] = useState(0)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/daily-insights/count')
        if (!res.ok) return
        const data = await res.json() as { count: number }
        setDailyInsightReviewCount(data.count ?? 0)
      } catch {
        // 비차단 — 배지 숨김
      }
    }
    void run()
  }, [])

  function isActive(href: string) {
    const [hrefPath, qs = ''] = href.split('?')
    if (hrefPath === '/admin' && !qs) return pathname === '/admin'
    const pathOk = pathname === hrefPath || pathname.startsWith(hrefPath + '/')
    if (!pathOk) return false
    if (!qs) {
      // 쿼리 없는 항목: 같은 pathname에 쿼리 있는 항목이 활성일 땐 양보한다
      const hasQuerySibling = ADMIN_NAV_GROUPS.some(g => g.items.some(it => {
        const [p, q] = it.href.split('?')
        if (p !== hrefPath || !q) return false
        return new URLSearchParams(q).get('category') === searchParams.get('category')
      }))
      return !hasQuerySibling
    }
    for (const [k, v] of new URLSearchParams(qs)) {
      if (searchParams.get(k) !== v) return false
    }
    return true
  }

  function groupHasUnread(group: typeof ADMIN_NAV_GROUPS[number]) {
    return group.items.some(
      (it) =>
        (it.href === '/admin/requests' && openRequestCount > 0) ||
        (it.href === '/admin/insights' && dailyInsightReviewCount > 0)
    )
  }

  const trimmedQuery = query.trim().toLowerCase()

  const allItems = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })))
  const visibleGroups = ADMIN_NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => showPlanned || !item.disabled),
    }))
    .filter((group) => group.items.length > 0 && (showPlanned || group.group !== '사용자 관리'))

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
    <aside
      style={{ width: collapsed ? RAIL_W : width }}
      className={cn(
        'sticky top-0 h-screen shrink-0 overflow-y-auto border-r border-border bg-card flex flex-col relative',
        !isDragging && 'transition-[width] duration-150'
      )}
    >
      {/* 로고 + 전체 접기/펴기 토글 */}
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border px-4 py-4',
          collapsed && 'flex-col gap-2 px-0 py-3'
        )}
      >
        <Link
          href="/admin"
          className={cn(
            'flex flex-1 items-center gap-2 rounded transition-colors hover:bg-accent/50',
            collapsed && 'flex-none justify-center'
          )}
        >
          {collapsed ? (
            <span className="text-xl font-bold text-brand-600" aria-label="Insight Out 어드민">IO</span>
          ) : (
            <>
              <span className="text-xl font-bold text-foreground">Insight Out</span>
              <span className="admin-badge rounded px-1.5 py-0.5 bg-brand-600 text-white">
                어드민
              </span>
            </>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '사이드바 펴기' : '사이드바 접기'}
          title={collapsed ? '사이드바 펴기' : '사이드바 접기'}
          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* 메뉴 검색 */}
      {!collapsed && (
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
      )}

      {/* 섹션 스크롤 영역 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {!collapsed && trimmedQuery ? (
          /* 검색 결과 (평면 리스트) — 폴딩 무시 */
          searchResults.length > 0 ? (
            <ul className="space-y-0.5">
              {searchResults.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    {/* prefetch-ok: 어드민 검색 네비 — 개수 고정, 이동 잦음 */}
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
          /* 기본 그룹 네비 — 8그룹 평탄화(지시서 278) + 그룹 폴딩(442) */
          visibleGroups.map((group) => {
            const isFolded = folded.has(group.group)
            return (
              <div key={group.group}>
                {collapsed ? null : (
                  <button
                    type="button"
                    onClick={() => toggleFolded(group.group)}
                    aria-expanded={!isFolded}
                    className="admin-sidebar-group mb-1 flex w-full items-center gap-1 rounded px-2 py-1 text-muted-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    {isFolded ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="flex-1 text-left">{group.group}</span>
                    {isFolded && groupHasUnread(group) && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk" aria-label="미확인 항목 있음" />
                    )}
                  </button>
                )}
                {(collapsed || !isFolded) && (
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      if (item.disabled) {
                        return (
                          <li key={item.href}>
                            <span
                              title={item.roadmap ?? (collapsed ? item.label : undefined)}
                              aria-label={collapsed ? item.label : undefined}
                              className={cn(
                                'admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 opacity-70 cursor-default text-muted-foreground',
                                collapsed && 'justify-center px-0'
                              )}
                            >
                              <Icon className="h-5 w-5 shrink-0" />
                              {!collapsed && <span className="flex-1">{item.label}</span>}
                              {!collapsed && item.badge && (
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
                          {/* prefetch-ok: 어드민 사이드바 네비 — 개수 고정, 이동 잦음 */}
                          <Link
                            href={item.href}
                            title={item.roadmap ?? (collapsed ? item.label : undefined)}
                            aria-label={collapsed ? item.label : undefined}
                            className={cn(
                              'admin-sidebar-menu flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition-colors',
                              collapsed && 'justify-center px-0',
                              active
                                ? 'bg-accent text-brand-600 font-medium'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span className="flex-1">{item.label}</span>}
                            {!collapsed && item.external && (
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-label="사용자 화면으로 이동" />
                            )}
                            {!collapsed && item.href === '/admin/requests' && openRequestCount > 0 && (
                              <span className="admin-caption rounded-full bg-risk-soft px-2 py-0.5 font-medium text-risk">
                                {openRequestCount}
                              </span>
                            )}
                            {!collapsed && item.href === '/admin/insights' && dailyInsightReviewCount > 0 && (
                              <span className="admin-caption rounded-full bg-risk-soft px-2 py-0.5 font-medium text-risk">
                                {dailyInsightReviewCount}
                              </span>
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })
        )}
      </nav>

      {!collapsed && (
        <div className="shrink-0 px-2 pb-2">
          <button
            type="button"
            aria-pressed={showPlanned}
            onClick={() => setShowPlanned((current) => !current)}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showPlanned ? '예정 기능 숨기기' : '예정 기능 보기'}
          </button>
        </div>
      )}

      {/* 하단 고정 영역 — 테마 토글 */}
      <div className={cn('shrink-0 border-t border-border px-2 py-3', collapsed && 'flex justify-center px-0')}>
        <AdminThemeToggle />
      </div>

      {/* 리사이즈 핸들 */}
      {!collapsed && (
        <div
          ref={resizeHandleRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 폭 조절"
          tabIndex={0}
          onMouseDown={handleHandleMouseDown}
          onKeyDown={handleHandleKeyDown}
          className={cn(
            'absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-brand-600/40 focus-visible:bg-brand-600/40 focus:outline-none',
            isDragging && 'bg-brand-600/40'
          )}
        />
      )}
    </aside>
  )
}
