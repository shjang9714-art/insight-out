'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FlaskConical, Menu, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import SearchBar from '@/components/dashboard/SearchBar'
import { cn } from '@/lib/utils'
import { buildL2Href, getL2ForSection } from '@/lib/nav/taxonomy'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'
import { useActiveCategoryContext } from '@/lib/nav/active-category-context'

// ─── 5탭 네비게이션 정의 ────────────────────────────────────────────────────────

export const NAV_TABS: { label: string; href: string; exact: boolean; icon?: LucideIcon }[] = [
  { label: '홈',        href: '/dashboard',          exact: true  },
  { label: 'AI 인사이트', href: '/dashboard/issues',   exact: false },
  { label: '기업동향',   href: '/dashboard/entities', exact: false },
  { label: '자료실',     href: '/dashboard/contents', exact: false },
]
// '리포트' L1 탭은 제거됨(지시서 2026-08-04c) — 전략보고서(/dashboard/reports)와
// 지식보고서(콘텐츠 category='지식보고서')를 자료실의 "AI 리포트" 탭 하나로 합쳤다.
// /dashboard/reports* 라우트는 그대로 남아 NAV_ALIAS_PREFIXES로 자료실 L1에 편입된다.

// 관리자 전용 '실험실' 퀵링크 — 숨김 처리된 하위 카테고리를 모아 보는 별도 페이지
// (/dashboard/lab, LabBoard.tsx) 하나로 이동. 현재/향후 실험 탭은 그 페이지 안에서 관리.

// Lv.2 탭 유지(§지시서 20260713)로 일부 상세 라우트가 Lv.1 섹션과 다른 최상위 경로
// 세그먼트를 쓰게 됨(예: daily-insights/[id]는 AI인사이트 소속이지만 /dashboard/issues
// 하위가 아님) — href 접두사 매칭만으로는 이런 라우트에서 어떤 탭도 active가 안 돼
// #l1-active-label이 아예 없어지고, NavGroupAlign이 marginLeft:0으로 폴백해 Lv.2 탭
// 위치가 어긋난다(§지시서 20260713-Lv2탭-위치일관성). 여기에 별칭 경로를 등록해 보정.
const NAV_ALIAS_PREFIXES: Record<string, string[]> = {
  '/dashboard/issues':   ['/dashboard/daily-insights', '/dashboard/keywords'],
  '/dashboard/entities': ['/dashboard/insights'],
  // 전략보고서 목록·상세(/dashboard/reports, /dashboard/reports/[id])는 리포트 L1이
  // 없어진 뒤로 자료실 소속이다(지시서 2026-08-04c) — 페이지 경로는 그대로 두고
  // L1만 자료실로 편입.
  '/dashboard/contents': ['/dashboard/reports'],
}

// 콘텐츠 상세(/dashboard/contents/[id])의 실제 category를 자료실 L2 강제 매핑에
// 쓰기 위해 RecordActiveCategoryHint → ActiveCategoryProvider로 전달된 값을 읽는다
// (taxonomy.tsx FORCED_L2가 이 categoryHint로 "컨설팅 리포트"·"공시자료"·"AI 리포트"
// 중 어느 L2가 활성인지 정한다). L1 자체는 더 이상 여기서 오버라이드하지 않는다 —
// /dashboard/contents/[id] 경로가 이미 기본 매칭으로 자료실이다.
const CONTENT_DETAIL_PATTERN = /^\/dashboard\/contents\/[^/]+$/

export function isTabActive(href: string, exact: boolean, pathname: string): boolean {
  if (exact) return pathname === href
  if (pathname === href || pathname.startsWith(href + '/')) return true
  return (NAV_ALIAS_PREFIXES[href] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

interface Props {
  onMenuClick?: () => void
  className?: string
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function DashboardHeader({ onMenuClick, className }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const category     = searchParams.get('category') ?? ''
  const { activeContentCategory } = useActiveCategoryContext()
  const isContentDetail = CONTENT_DETAIL_PATTERN.test(pathname)
  // category 쿼리파라미터가 있으면(카드 클릭 진입) 첫 렌더부터 바로 읽을 수 있어
  // 깜빡임이 없다 — 없으면(인용 링크 등 category 미포함 진입) activeContentCategory
  // 컨텍스트로 폴백(RecordActiveCategoryHint가 mount 시 알려줌, 여전히 약간의 지연 가능).
  const contentDetailCategoryHint = isContentDetail ? (category || activeContentCategory) : null

  const [userName, setUserName]     = useState<string | null>(null)
  const [userTeam, setUserTeam]     = useState('')
  const [isAdmin, setIsAdmin]       = useState(false)

  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  // entities/[id]는 경로상 기업동향 소속이지만, AI인사이트 키워드 탭에서 진입한
  // 경우(origin=issues)엔 AI인사이트가 active여야 L2도 맞게 뜬다.
  const isEntityDetailFromIssues =
    pathname.startsWith('/dashboard/entities/') && searchParams.get('origin') === 'issues'
  const activeL1Href = isEntityDetailFromIssues
    ? '/dashboard/issues'
    : (NAV_TABS.find((tab) => isTabActive(tab.href, tab.exact, pathname))?.href ?? null)

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
          // isAdmin 계산(users.role === 'admin')과 동일 기준
          setIsAdmin(data?.role === 'admin')
        })
    })
  }, [])

  return (
    <header className={cn('sticky top-0 z-20 bg-card/90 backdrop-blur-sm', className)}>

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
          </div>

          <ThemeToggle />

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
                <span id={active ? 'l1-active-label' : undefined}>{tab.label}</span>
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

      {/* ── L2 하위 탭 (md+, sticky 헤더에 통합·상시노출) ──────────────────────── */}
      <L2Row
        activeL1Href={activeL1Href}
        pathname={pathname}
        searchParams={searchParams}
        categoryHint={contentDetailCategoryHint}
      />
    </header>
  )
}

// ─── L2 행 ──────────────────────────────────────────────────────────────────
// L1 sticky 헤더 안에 통합해 스크롤해도 함께 고정되고 항상 노출된다(372).
// 마우스 위치와 무관하게 항상 실제 활성 라우트(activeL1Href)의 하위 탭만 보여준다
// — 호버로 내용/위치가 바뀌는 "프리뷰" 기능은 제거됨(§지시서 20260718). 이유:
// 사용자가 요청한 적 없는 기능이었고, 마우스만 올려도 L2 내용·위치가 바뀌어
// 실제 활성 상태를 오인하게 만드는 버그로 이어졌다(§지시서 20260716b/20260718).
function L2Row({
  activeL1Href,
  pathname,
  searchParams,
  categoryHint,
}: {
  activeL1Href: string | null
  pathname: string
  searchParams: URLSearchParams
  categoryHint: string | null
}) {
  const l2 = activeL1Href ? getL2ForSection(activeL1Href, pathname, searchParams, categoryHint) : null

  return (
    <nav className="hidden min-h-[30px] md:flex" aria-label="하위 메뉴">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 pt-1 pb-1 sm:px-5">
        {/* Lv.2 탭 그룹은 항상 활성 Lv.1 라벨(#l1-active-label)의 텍스트 시작
            x좌표에서 시작해야 한다(§지시서 20260712/20260713/20260716) —
            372에서 헤더 sticky 통합 후에도 이 규칙은 유지 */}
        {/* remeasureKey=activeL1Href — 실제 라우트가 바뀔 때마다 재측정(§지시서 20260716b) */}
        <NavGroupAlign className="flex items-center gap-6 tracking-[-0.01em]" remeasureKey={activeL1Href}>
          {l2 && l2.section.tabs.map((tab) => {
            const active = tab.id === l2.activeId
            return (
              // prefetch-ok: L2 탭 — 개수 고정, 이동 잦음
              <Link
                key={tab.id}
                href={buildL2Href(l2.section, tab, pathname, searchParams)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap pt-1 pb-1 text-[15px] transition-colors',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('h-1 w-1 shrink-0 rounded-full', active ? 'bg-brand-600' : 'bg-transparent')} />
                {tab.label}
              </Link>
            )
          })}
        </NavGroupAlign>
      </div>
    </nav>
  )
}
