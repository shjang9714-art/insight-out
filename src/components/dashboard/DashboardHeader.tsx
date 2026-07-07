'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, Search } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { getKstTodayStartIso } from '@/lib/date'
import SearchBar from '@/components/dashboard/SearchBar'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

// ─── 5탭 네비게이션 정의 ────────────────────────────────────────────────────────

export const NAV_TABS = [
  { label: '홈',        href: '/dashboard',          exact: true  },
  { label: 'AI 인사이트', href: '/dashboard/issues',   exact: false },
  { label: '기업동향',   href: '/dashboard/entities', exact: false },
  { label: '콘텐츠',     href: '/dashboard/contents', exact: false },
  { label: '전략보고서', href: '/dashboard/reports',  exact: false },
]

export function isTabActive(href: string, exact: boolean, pathname: string): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────────

function getPageLabel(pathname: string, category: string): string | null {
  if (pathname === '/dashboard') return null
  if (/^\/dashboard\/contents\/.+/.test(pathname)) return '콘텐츠 상세'
  if (pathname.startsWith('/dashboard/contents')) {
    if (!category) return '전체 콘텐츠'
    return CONTENT_CATEGORY_LABEL[category as ContentCategory] ?? category
  }
  if (pathname.startsWith('/dashboard/youtube'))   return '유튜브 영상'
  if (pathname.startsWith('/dashboard/search'))    return '검색'
  if (pathname.startsWith('/dashboard/mypage'))    return '마이페이지'
  if (pathname.startsWith('/dashboard/briefings')) return '지난 브리핑'
  return null
}

interface Props {
  onMenuClick?: () => void
}

interface NotifItem {
  id: string
  title: string
  href: string
  time: string
}

const READ_KEY = 'io:read-notifications'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
  })
}

function getReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(READ_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function markRead(id: string) {
  if (typeof window === 'undefined') return
  const ids = getReadIds()
  ids.add(id)
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function DashboardHeader({ onMenuClick }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const category     = searchParams.get('category') ?? ''
  const pageLabel    = getPageLabel(pathname, category)

  const [showNotifications, setShowNotifications] = useState(false)
  const [userName, setUserName]     = useState<string | null>(null)
  const [userTeam, setUserTeam]     = useState('')
  const [notifications, setNotifications] = useState<NotifItem[]>([])
  const [readIds, setReadIds]       = useState<Set<string>>(new Set())
  const [todayCount, setTodayCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setUserName(''); return }
      supabase
        .from('users')
        .select('name, team')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setUserName(data?.name ?? '')
          if (data?.team) setUserTeam(data.team)
        })
    })
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      const { data } = await supabase
        .from('contents')
        .select('id, title, category, created_at')
        .eq('status', 'published')
        .neq('category', '유튜브')
        .order('created_at', { ascending: false })
        .limit(8)

      if (!data) return

      const items: NotifItem[] = data.map((row) => ({
        id: row.id,
        title: row.title,
        href: `/dashboard/contents/${row.id}`,
        time: timeAgo(row.created_at),
      }))
      setNotifications(items)
      setReadIds(getReadIds())

      const { count } = await supabase
        .from('contents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('collected_at', getKstTodayStartIso())
      setTodayCount(count ?? 0)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length

  function handleNotifClick(id: string) {
    markRead(id)
    setReadIds(getReadIds())
    setShowNotifications(false)
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-sm">

      {/* ── 메인 바 ─────────────────────────────────────────────────────────────── */}
      <div className="flex h-14 items-center px-4 sm:px-5">

        {/* 좌측: 햄버거(모바일) + 로고 + 브레드크럼 */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 transition-colors hover:bg-accent md:hidden"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 lg:w-52">
            <Image
              src="/favicon-512.png"
              alt="Insight Out"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0"
            />
            <span className="font-semibold text-foreground">Insight Out</span>
          </Link>
          {pageLabel && (
            <div className="hidden items-center gap-0.5 lg:flex">
              <span className="rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600">
                {pageLabel}
              </span>
            </div>
          )}
        </div>

        {/* 중앙: 검색 (md+) */}
        <div className="mx-4 hidden flex-1 md:block">
          <div className="mx-auto max-w-2xl">
            <SearchBar />
          </div>
        </div>

        {/* 우측: 액션 */}
        <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
          <Link
            href="/dashboard/search"
            className="rounded-lg p-2 transition-colors hover:bg-accent md:hidden"
            aria-label="검색"
          >
            <Search className="h-5 w-5 text-muted-foreground" />
          </Link>

          <div className="hidden flex-col items-end lg:flex">
            <span className="text-xs font-medium text-foreground">{today}</span>
            {todayCount > 0 && (
              <span className="text-[11px] font-medium text-brand-600">
                오늘 업데이트 {todayCount}건
              </span>
            )}
          </div>

          <ThemeToggle />

          {/* 알림 */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-lg p-2 transition-colors hover:bg-accent"
            >
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-border bg-card shadow-xl">
                <div className="border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">최근 콘텐츠</span>
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-muted-foreground">새 콘텐츠가 없습니다.</p>
                  ) : (
                    notifications.map((n) => {
                      const isRead = readIds.has(n.id)
                      return (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => handleNotifClick(n.id)}
                          className={`block px-4 py-3 transition-colors hover:bg-accent ${isRead ? '' : 'bg-brand-50/60 dark:bg-brand-950/20'}`}
                        >
                          <p className="line-clamp-2 text-xs leading-snug text-foreground">{n.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                        </Link>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 사용자 */}
          <Link
            href="/dashboard/mypage"
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent"
            title="마이페이지"
          >
            {userName === null ? (
              <div className="hidden flex-col items-end gap-1 sm:flex">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="hidden flex-col items-end sm:flex">
                {userName && <span className="text-xs font-semibold text-foreground">{userName}</span>}
                {userTeam && <span className="text-[11px] text-muted-foreground">{userTeam}</span>}
              </div>
            )}
            {userName === null ? (
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-white">
                {userName ? userName[0] : '?'}
              </div>
            )}
          </Link>
        </div>
      </div>

      {/* ── 5탭 네비게이션 (md+, CategoryGrid 톤 참고) ──────────────────────────── */}
      <nav
        className="hidden md:flex items-stretch border-t border-border"
        aria-label="주 메뉴"
      >
        {NAV_TABS.map((tab) => {
          const active = isTabActive(tab.href, tab.exact, pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 items-center justify-center py-3.5 text-lg font-medium transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:transition-colors ${
                active
                  ? 'text-pink-600 after:bg-pink-500 hover:after:bg-pink-700'
                  : 'text-muted-foreground after:bg-transparent hover:after:bg-muted-foreground'
              }`}
            >
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
