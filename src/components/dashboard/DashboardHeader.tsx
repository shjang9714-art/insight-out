'use client'

import { useState, useEffect, startTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FlaskConical, FolderOpen, Menu, Search, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'

// ─── 5탭 네비게이션 정의 ────────────────────────────────────────────────────────

// 'AI 인사이트' L1은 제거됨(지시서 2026-08-04d) — 그 아래 있던 핵심 인사이트·
// 키워드 분석·관계지도 3개 L2 탭을 각각 L1로 승격했다. 셋 다 같은 경로
// (/dashboard/issues)를 view= 쿼리파라미터로만 구분해 쓰므로, href에 쿼리를
// 그대로 박아두고 issuesL1HrefForView()가 view 값으로 활성 탭을 가른다(아래).
export const NAV_TABS: { label: string; href: string; exact: boolean; icon?: LucideIcon }[] = [
  { label: '홈',         href: '/dashboard',                     exact: true  },
  { label: '핵심 인사이트', href: '/dashboard/issues',              exact: false },
  { label: '키워드 분석',  href: '/dashboard/issues?view=keyword', exact: false },
  { label: '기업동향',    href: '/dashboard/entities',            exact: false },
  { label: '관계지도',    href: '/dashboard/issues?view=graph',   exact: false },
  { label: '자료실',      href: '/dashboard/contents',            exact: false },
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
// '/dashboard/issues' 키는 DashboardHeader의 activeL1Href·MobileBottomNav(둘 다
// resolveIssuesActiveHref로 판정, 위)에서는 이제 안 쓴다 — DashboardShell.tsx의
// 모바일 드로어가 NAV_TABS(6개 L1)를 isTabActive로만 판정하며 아직 참조하므로
// 지우지 않는다(드로어는 지시서 2026-08-05 Stage 6에서 의도적으로 손대지 않음 —
// 핵심 인사이트·키워드 분석이 동시에 active로 보이는 기존 한계가 드로어엔 남아있음).
const NAV_ALIAS_PREFIXES: Record<string, string[]> = {
  '/dashboard/issues':   ['/dashboard/daily-insights', '/dashboard/keywords'],
  '/dashboard/entities': ['/dashboard/insights'],
  // 전략보고서 목록·상세(/dashboard/reports, /dashboard/reports/[id])는 리포트 L1이
  // 없어진 뒤로 자료실 소속이다(지시서 2026-08-04c) — 페이지 경로는 그대로 두고
  // L1만 자료실로 편입.
  '/dashboard/contents': ['/dashboard/reports'],
}

// 핵심 인사이트·키워드 분석·관계지도 3개 L1이 전부 /dashboard/issues를 공유하므로
// (지시서 2026-08-04d) NAV_TABS의 href 문자열(쿼리 포함)을 그대로 활성 판정 값으로
// 쓴다 — 아래서 pathname·view 쿼리로 이 셋 중 하나를 정확히 골라 activeL1Href에 넣는다.
// export: MobileBottomNav·모바일 전용 아이콘(자료실 우측 액션 영역)이 데스크톱과
// 정확히 같은 값으로 비교하기 위해 재사용한다(지시서 2026-08-05, Stage 6).
export const ISSUES_L1_HREFS = {
  brief: '/dashboard/issues',
  keyword: '/dashboard/issues?view=keyword',
  graph: '/dashboard/issues?view=graph',
} as const

function issuesL1HrefForView(
  view: string | null,
  fallback: keyof typeof ISSUES_L1_HREFS
): string {
  if (view === 'keyword' || view === 'graph' || view === 'brief') return ISSUES_L1_HREFS[view]
  return ISSUES_L1_HREFS[fallback]
}

// daily-insights 상세→핵심 인사이트, keywords 상세→키워드 분석, /dashboard/issues
// 자체(및 하위)는 view= 쿼리로 판정. 그 외 경로면 null(이 라우트들과 무관).
// DashboardHeader의 activeL1Href·MobileBottomNav·모바일 전용 관계지도 아이콘이
// 전부 이 함수 하나로 판정해 셋이 어긋나지 않는다(지시서 2026-08-05, Stage 6).
export function resolveIssuesActiveHref(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname.startsWith('/dashboard/daily-insights')) return ISSUES_L1_HREFS.brief
  if (pathname.startsWith('/dashboard/keywords')) return ISSUES_L1_HREFS.keyword
  if (pathname === '/dashboard/issues' || pathname.startsWith('/dashboard/issues/')) {
    return issuesL1HrefForView(searchParams.get('view'), 'brief')
  }
  return null
}

export function isTabActive(href: string, exact: boolean, pathname: string): boolean {
  if (exact) return pathname === href
  if (pathname === href || pathname.startsWith(href + '/')) return true
  return (NAV_ALIAS_PREFIXES[href] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

interface Props {
  onMenuClick?: () => void
  onSearchClick?: () => void
  className?: string
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function DashboardHeader({ onMenuClick, onSearchClick, className }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [userName, setUserName]     = useState<string | null>(null)
  const [userTeam, setUserTeam]     = useState('')
  const [isAdmin, setIsAdmin]       = useState(false)
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

  // entities/[id]는 경로상 기업동향 소속이지만, 키워드 분석 탭에서 진입한
  // 경우(origin=issues)엔 그 탭(기본값)이나 view= 쿼리가 가리키는 탭이 active여야
  // 한다 — 옛 FORCED_L2의 `sp.get('view') ?? 'keyword'`와 동일 기본값.
  const isEntityDetailFromIssues =
    pathname.startsWith('/dashboard/entities/') && searchParams.get('origin') === 'issues'
  // /dashboard/entities?view=documents(기업·기술 자료 목록)는 경로 접두사가
  // /dashboard/entities라 isTabActive가 기본적으로 "기업동향"을 골라버리지만,
  // 이 뷰는 자료실의 "공시자료" 탭으로 이관됐다(taxonomy.tsx disclosure 항목,
  // 지시서 2026-08-04b). 상단 L1이 기업동향으로 잘못 켜지는 버그(2026-08-05
  // 리포트)를 막기 위해 여기서 자료실로 강제한다 — L2 활성 탭은
  // taxonomy.tsx의 FORCED_L2(pathname==='/dashboard/entities') 항목이 맞춘다.
  const isDocumentsViewFromEntities =
    pathname === '/dashboard/entities' && searchParams.get('view') === 'documents'
  const activeL1Href =
    resolveIssuesActiveHref(pathname, searchParams)
    ?? (isEntityDetailFromIssues ? issuesL1HrefForView(searchParams.get('view'), 'keyword') : null)
    ?? (isDocumentsViewFromEntities ? '/dashboard/contents' : null)
    ?? (NAV_TABS.find((tab) => isTabActive(tab.href, tab.exact, pathname))?.href ?? null)

  // 모바일 전용 관계지도·자료실 아이콘(우측 액션 영역, 지시서 2026-08-05 Stage 6)의
  // 활성 판정 — 데스크톱 L1과 정확히 같은 기준(resolveIssuesActiveHref·isTabActive)을 쓴다.
  const isGraphActive = resolveIssuesActiveHref(pathname, searchParams) === ISSUES_L1_HREFS.graph
  const isContentsActive = isTabActive('/dashboard/contents', false, pathname) || isDocumentsViewFromEntities

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

        {/* 중앙: 기존 검색창 자리 — 검색은 우측 액션의 작은 버튼으로 이동(A 스펙).
            hidden md:block으로 이전과 동일하게 모바일에서는 폭을 차지하지 않는다. */}
        <div className="mx-4 hidden flex-1 md:block" />

        {/* 우측: 액션 */}
        <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
          {/* 모바일 전용 — 관계지도·자료실은 데스크톱에선 이미 L1 탭이라 md:hidden 필수
              (중복 노출 금지). 하단바가 4탭(홈·핵심 인사이트·키워드 분석·기업동향)으로
              줄면서(지시서 2026-08-05 Stage 6) 나머지 2개 L1의 모바일 진입점을 여기로
              옮겼다 — 검색 아이콘 좌측에 배치. */}
          <Link
            href="/dashboard/issues?view=graph"
            className={cn(
              'rounded-lg p-2 transition-colors hover:bg-accent md:hidden',
              isGraphActive ? 'text-brand-600' : 'text-muted-foreground'
            )}
            aria-label="관계지도"
            aria-current={isGraphActive ? 'page' : undefined}
          >
            <Waypoints className="h-5 w-5" />
          </Link>
          <Link
            href="/dashboard/contents"
            className={cn(
              'rounded-lg p-2 transition-colors hover:bg-accent md:hidden',
              isContentsActive ? 'text-brand-600' : 'text-muted-foreground'
            )}
            aria-label="자료실"
            aria-current={isContentsActive ? 'page' : undefined}
          >
            <FolderOpen className="h-5 w-5" />
          </Link>
          {/* 모바일 검색은 하단바 중앙 원형 FAB로 되돌아감(지시서 Stage 6-1) — 좁은
              화면에서 우측 액션이 관계지도·자료실·돋보기·다크모드 4개로 붐볐던 것을
              완화. MobileBottomNav.tsx의 SearchFab 참고. */}

          {/* 검색 버튼 — 돋보기 아이콘만(후속 개편 2026-08-09b, 글자·⌘K 배지 제거).
              단축키 힌트는 hover title 툴팁으로만 남김. 날짜 표시 왼쪽에 둬서
              [돋보기][다크모드][날짜][프로필] 순서가 되게 한다(2026-08-10, 다크모드를
              날짜 왼쪽으로 재배치 — 돋보기는 이미 날짜 왼쪽이라 그대로 둠).
              모바일은 하단바 중앙 FAB(MobileBottomNav.tsx)가 같은 오버레이를 열므로 여기선 숨김. */}
          <button
            type="button"
            onClick={onSearchClick}
            title={`검색 (${kbdHint})`}
            className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
            aria-label="검색"
          >
            <Search className="h-5 w-5" />
          </button>

          <ThemeToggle />

          <div className="hidden flex-col items-end lg:flex">
            <span className="text-xs font-medium text-foreground">{today}</span>
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
    </header>
  )
}
