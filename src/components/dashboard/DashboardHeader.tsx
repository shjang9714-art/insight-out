'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATIONS, TODAY_UPDATES } from './mock-data'

interface Props {
  onMenuClick?: () => void
}

export default function DashboardHeader({ onMenuClick }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [userName, setUserName] = useState('—')
  const [userTeam, setUserTeam] = useState('')
  const notifRef = useRef<HTMLDivElement>(null)

  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  // 검색 페이지 진입 시 URL 의 q 파라미터로 입력창 동기화
  useEffect(() => {
    if (pathname === '/dashboard/search') {
      const q = searchParams.get('q') ?? ''
      startTransition(() => setSearchQuery(q))
    }
  }, [pathname, searchParams])

  // Enter 또는 폼 제출 → 검색 결과 페이지로 이동
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    router.push(`/dashboard/search?q=${encodeURIComponent(q)}`)
  }

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
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-5">
        {/* 모바일 햄버거 버튼 */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100 lg:hidden"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>

        {/* Logo */}
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 lg:w-52">
          <Image
            src="/logo.png"
            alt="Insight Out"
            width={976}
            height={286}
            priority
            className="h-8 w-auto"
          />
          <span className="hidden text-xs text-gray-400 sm:block">B2B Intelligence</span>
          <span className="hidden sm:inline-block bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
            DEMO
          </span>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} className="max-w-xl flex-1">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="콘텐츠 제목·요약 검색 (Enter)"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="검색어 지우기"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {/* Date + updates */}
          <div className="hidden flex-col items-end md:flex">
            <span className="text-xs font-medium text-gray-700">{today}</span>
            <span className="text-[11px] font-medium text-brand-600">
              오늘 업데이트 {TODAY_UPDATES}건
            </span>
          </div>

          {/* Notification */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <svg
                className="h-5 w-5 text-gray-600"
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
              <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-gray-100 bg-white shadow-xl">
                <div className="border-b border-gray-50 px-4 py-3">
                  <span className="text-sm font-semibold text-gray-900">알림</span>
                </div>
                <div className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
                  {NOTIFICATIONS.map((n) => (
                    <div key={n.id} className={`px-4 py-3 ${n.read ? '' : 'bg-brand-50/60'}`}>
                      <p className="text-xs leading-snug text-gray-800">{n.text}</p>
                      <p className="mt-1 text-[11px] text-gray-400">{n.time}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-amber-600">
                  표시되는 알림은 샘플 데이터입니다
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <Link
            href="/dashboard/mypage"
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-gray-100"
            title="마이페이지"
          >
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-semibold text-gray-800">{userName}</span>
              {userTeam && <span className="text-[11px] text-gray-400">{userTeam}</span>}
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
