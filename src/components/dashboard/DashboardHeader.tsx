'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

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

export default function DashboardHeader({ onMenuClick }: Props) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [userName, setUserName]   = useState('—')
  const [userTeam, setUserTeam]   = useState('')
  const [notifications, setNotifications] = useState<NotifItem[]>([])
  const [readIds, setReadIds]     = useState<Set<string>>(new Set())
  const [todayCount, setTodayCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('users')
        .select('name, team')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.name) setUserName(data.name)
          if (data?.team) setUserTeam(data.team)
        })
    })
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      // KST 오늘 0시 ISO 문자열 계산
      const kstOffset = 9 * 60 * 60 * 1000
      const nowKst = new Date(Date.now() + kstOffset)
      const kstDateStr = nowKst.toISOString().slice(0, 10) // YYYY-MM-DD
      const kstMidnightUtc = new Date(`${kstDateStr}T00:00:00+09:00`).toISOString()

      // 최근 8건 콘텐츠 (유튜브 제외)
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

      // 오늘 카운트: 별도 쿼리
      const { count } = await supabase
        .from('contents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('created_at', kstMidnightUtc)
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
      <div className="flex h-14 items-center gap-4 px-4 sm:px-5">
        {/* 모바일 햄버거 버튼 */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 transition-colors hover:bg-accent lg:hidden"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Logo */}
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 lg:w-52">
          <Image
            src="/brand/logo-mark.png"
            alt="Insight Out"
            width={32}
            height={32}
            priority
            className="h-8 w-8 shrink-0"
          />
          <span className="font-semibold text-foreground">Insight Out</span>
        </Link>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {/* Date + updates */}
          <div className="hidden flex-col items-end md:flex">
            <span className="text-xs font-medium text-foreground">{today}</span>
            {todayCount > 0 && (
              <span className="text-[11px] font-medium text-brand-600">
                오늘 업데이트 {todayCount}건
              </span>
            )}
          </div>

          {/* 테마 토글 */}
          <ThemeToggle />

          {/* Notification */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-lg p-2 transition-colors hover:bg-accent"
            >
              <svg
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
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

          {/* User */}
          <Link
            href="/dashboard/mypage"
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent"
            title="마이페이지"
          >
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-semibold text-foreground">{userName}</span>
              {userTeam && <span className="text-[11px] text-muted-foreground">{userTeam}</span>}
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {userName !== '—' ? userName[0] : '?'}
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
