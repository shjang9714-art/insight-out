'use client'

import { useState, useEffect, useRef } from 'react'
import { NOTIFICATIONS, TODAY_UPDATES, MOCK_USER } from './mock-data'

export default function DashboardHeader() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

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
      <div className="flex h-14 items-center gap-4 px-5">
        {/* Logo */}
        <div className="flex w-52 shrink-0 items-center gap-2">
          <span className="text-base font-bold tracking-tight text-gray-900">Insight Out</span>
          <span className="hidden text-xs text-gray-400 sm:block">B2B Intelligence</span>
        </div>

        {/* Search */}
        <div className="max-w-xl flex-1">
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
              placeholder="키워드, 서비스, 경쟁사 검색..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {/* Date + updates */}
          <div className="hidden flex-col items-end md:flex">
            <span className="text-xs font-medium text-gray-700">{today}</span>
            <span className="text-[11px] font-medium text-blue-600">
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
                    <div key={n.id} className={`px-4 py-3 ${n.read ? '' : 'bg-blue-50/50'}`}>
                      <p className="text-xs leading-snug text-gray-800">{n.text}</p>
                      <p className="mt-1 text-[11px] text-gray-400">{n.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <div className="flex items-center gap-2">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-semibold text-gray-800">{MOCK_USER.name}</span>
              <span className="text-[11px] text-gray-400">{MOCK_USER.team}</span>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {MOCK_USER.name[0]}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
