'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, FlaskConical, LogOut, Menu, Search, User } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { NAV_TABS, resolveActiveNav } from '@/lib/nav/active'
import ContentsL2Tabs from '@/components/nav/ContentsL2Tabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'
import { getL2ForSection } from '@/lib/nav/taxonomy'
import { isAdminRole } from '@/lib/admin/capabilities'

export { ISSUES_L1_HREFS, NAV_TABS, isTabActive, resolveIssuesActiveHref } from '@/lib/nav/active'

// ─── 6탭 네비게이션 ─────────────────────────────────────────────────────────────

// NAV_TABS와 활성 판정은 active.ts에서 관리한다. 기존 외부 import 호환을 위해
// 이 파일에서도 관련 심볼을 재export한다.
// '리포트' L1 탭은 제거됨(지시서 2026-08-04c) — 전략보고서(/dashboard/reports)와
// 지식보고서(콘텐츠 category='지식보고서')를 자료실의 "AI 리포트" 탭 하나로 합쳤다.
// /dashboard/reports* 라우트는 그대로 남아 NAV_ALIAS_PREFIXES로 자료실 L1에 편입된다.

// 관리자 전용 '실험실' 퀵링크 — 숨김 처리된 하위 카테고리를 모아 보는 별도 페이지
// (/dashboard/lab, LabBoard.tsx) 하나로 이동. 현재/향후 실험 탭은 그 페이지 안에서 관리.

interface Props {
  onMenuClick?: () => void
  onOpenSearch?: () => void
  className?: string
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function DashboardHeader({ onMenuClick, onOpenSearch, className }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router        = useRouter()

  const [userName, setUserName]     = useState<string | null>(null)
  const [userTeam, setUserTeam]     = useState('')
  const [isAdmin, setIsAdmin]       = useState(false)
  const [hoveredL1Href, setHoveredL1Href] = useState<string | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 검색 버튼의 단축키 힌트 배지 — 서버 렌더는 항상 '⌘K'로 고정해 하이드레이션 불일치를
  // 막고, mount 후에만(클라이언트 전용 navigator 값) Windows/Linux면 'Ctrl+K'로 갱신한다.
  const [kbdHint, setKbdHint] = useState('⌘K')
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    startTransition(() => setKbdHint(isMac ? '⌘K' : 'Ctrl+K'))
  }, [])

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  const { l1Href: activeL1Href } = resolveActiveNav(pathname, searchParams)
  const displayedL1Href = hoveredL1Href ?? activeL1Href
  const hoveredL2 = hoveredL1Href
    ? getL2ForSection(hoveredL1Href, pathname, searchParams)
    : null

  const cancelHoverClose = () => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }

  const scheduleHoverClose = () => {
    cancelHoverClose()
    hoverCloseTimerRef.current = setTimeout(() => {
      setHoveredL1Href(null)
      hoverCloseTimerRef.current = null
    }, 120)
  }

  useEffect(() => () => cancelHoverClose(), [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setUserName(''); return }
      supabase
        .from('users')
        .select('name, team, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setUserName(data?.name ?? '')
          if (data?.team) setUserTeam(data.team)
          // 실험실(관리자 전용) 5탭줄 노출 판정용 — AiInsightBoard.tsx의 서버측
          // isAdmin 계산(isAdminRole)과 동일 기준
          setIsAdmin(isAdminRole(data?.role))
        })
    })
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className={cn('sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-sm', className)}
      onMouseLeave={scheduleHoverClose}
      onMouseEnter={cancelHoverClose}
    >

      {/* ── 메인 바 ─────────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-5">

        {/* 좌측: 햄버거(모바일) + 로고 */}
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
        </div>

        {/* 중앙: 기존 검색창 자리 — 검색은 우측 액션의 작은 버튼으로 이동(A 스펙).
            hidden md:block으로 이전과 동일하게 모바일에서는 폭을 차지하지 않는다. */}
        <div className="mx-4 hidden flex-1 md:block" />

        {/* 우측: 액션 */}
        <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
          {/* 검색 버튼 — 돋보기 아이콘만(후속 개편 2026-08-09b, 글자·⌘K 배지 제거).
              단축키 힌트는 hover title 툴팁으로만 남기고 모바일에서도 같은 검색
              오버레이를 연다. */}
          <button
            type="button"
            onClick={onOpenSearch}
            title={`검색 (${kbdHint})`}
            className="inline-flex rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="검색"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* 북마크 진입 — 죽은 Sidebar.tsx에만 있던 링크를 헤더로 옮김(지시서 513).
              북마크는 이번 모바일 내비게이션 범위가 아니므로 lg+ 노출을 유지한다.
              517 — 아카이브는 북마크로 통합돼 아이콘 제거. */}
          <Link
            href="/dashboard/bookmarks"
            title="북마크"
            className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
            aria-label="북마크 모아보기"
          >
            <Bookmark className="h-5 w-5" />
          </Link>

          <div className="hidden flex-col items-end lg:flex">
            <span className="text-xs font-medium text-foreground">{today}</span>
          </div>

          {/* 사용자 — 드롭다운(마이페이지·로그아웃). 헤더에서 바로 로그아웃 가능하게(F-05) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent aria-expanded:bg-accent"
                title="계정"
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
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/mypage">
                  <User className="h-4 w-4" />
                  마이페이지
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout} className="text-negative">
                <LogOut className="h-4 w-4" />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 6탭 네비게이션 (md+, CategoryGrid 톤 참고) ──────────────────────────── */}
      <nav
        className="hidden md:flex"
        aria-label="주 메뉴"
      >
        <div id="l1-nav-row" className="mx-auto flex w-full max-w-6xl items-stretch justify-start gap-9 px-4 sm:px-5 tracking-[-0.01em]">
          {NAV_TABS.map((tab) => {
            const active = tab.href === activeL1Href
            return (
              // prefetch-ok: 네비 탭 — 개수 고정, 이동 잦음
              <Link
                key={tab.href}
                href={tab.href}
                onMouseEnter={() => {
                  cancelHoverClose()
                  setHoveredL1Href(tab.href)
                }}
                onFocus={() => {
                  cancelHoverClose()
                  setHoveredL1Href(tab.href)
                }}
                onBlur={scheduleHoverClose}
                className={`inline-flex items-center gap-2 py-1.5 text-[17px] transition-colors ${
                  active
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${active ? 'bg-brand-600' : 'bg-transparent'}`} />
                {tab.icon && <tab.icon className="h-3.5 w-3.5 shrink-0" />}
                {/* id="l1-active-label"는 NavGroupAlign(§지시서 20260712)이 L2 탭 그룹의
                    좌측 시작점을 이 라벨의 텍스트 x좌표에 맞추는 기준점으로 씀 */}
                <span id={tab.href === displayedL1Href ? 'l1-active-label' : undefined}>{tab.label}</span>
              </Link>
            )
          })}

          {/* 실험실 — 관리자 전용. ml-auto로 우측 끝에 배치해 상단 바의 프로필 열과
              같은 max-w-6xl 컨테이너·패딩을 공유하며 자동으로 열이 맞음. (2026-07-10,
              기존에는 AiInsightBoard.tsx 안 L2 탭 영역에 있던 것을 여기로 이동) */}
          {isAdmin && (
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/dashboard/lab"
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-brand-700 transition-colors',
                  pathname.startsWith('/dashboard/lab')
                    ? 'border-brand-600/50 bg-brand-600/20'
                    : 'border-brand-600/30 bg-brand-600/10 hover:border-brand-600/50 hover:bg-brand-600/20',
                )}
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                실험실
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* L2가 있는 L1만 떠 있는 세로 패널을 표시한다. 닫기를 120ms 늦추고 패널
          진입 시 취소해 L1과 absolute 패널 사이를 이동할 때 호버가 끊기지 않는다. */}
      {hoveredL1Href && hoveredL2 && (
        <div
          className="pointer-events-none absolute inset-x-0 top-full hidden md:block"
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          onFocus={cancelHoverClose}
          onBlur={scheduleHoverClose}
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-5">
            <NavGroupAlign remeasureKey={hoveredL1Href} className="pointer-events-auto">
              <ContentsL2Tabs
                l1Href={hoveredL1Href}
                className="rounded-lg border border-border bg-card shadow-lg"
              />
            </NavGroupAlign>
          </div>
        </div>
      )}
    </header>
  )
}
