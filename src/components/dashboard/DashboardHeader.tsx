'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FlaskConical, FolderOpen, Menu, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import SearchBar from '@/components/dashboard/SearchBar'
import { cn } from '@/lib/utils'
import { buildL2Href, getL2ForSection } from '@/lib/nav/taxonomy'
import { useActiveCategoryContext } from '@/lib/nav/active-category-context'

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
    <>
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
    </header>

    {/* ── L2 하위 탭 (md+, 비고정) ─────────────────────────────────────────────
        header 밖(형제)에 렌더 — sticky가 아니라 페이지 콘텐츠와 함께 스크롤되고,
        콘텐츠 상단(예: ContentsBoard의 "뉴스 · 총 N건" 제목) 바로 위에 온다
        (지시서 2026-08-04e). 이전엔 sticky header 안에 통합해 상시노출했었다(372). */}
    <L2Row
      activeL1Href={activeL1Href}
      pathname={pathname}
      searchParams={searchParams}
      categoryHint={contentDetailCategoryHint}
    />
    </>
  )
}

// ─── L2 행 ──────────────────────────────────────────────────────────────────
// 마우스 위치와 무관하게 항상 실제 활성 라우트(activeL1Href)의 하위 탭만 보여준다
// — 호버로 내용/위치가 바뀌는 "프리뷰" 기능은 제거됨(§지시서 20260718). 이유:
// 사용자가 요청한 적 없는 기능이었고, 마우스만 올려도 L2 내용·위치가 바뀌어
// 실제 활성 상태를 오인하게 만드는 버그로 이어졌다(§지시서 20260716b/20260718).
// 왼쪽 정렬 + 밑줄 텍스트형(지시서 2026-08-04e) — 예전엔 활성 L1 라벨의 x좌표에
// 맞추려 NavGroupAlign으로 밀었지만, header 밖(비고정)으로 옮기며 그 이유가
// 없어져 헤더와 같은 컨테이너(mx-auto max-w-6xl px-4 sm:px-5)로 왼쪽 정렬만 한다.
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
  // 하위 탭이 없는 L1(현재는 자료실 외 전부)에서는 공간도 차지하지 않는다 —
  // 데스크톱 밑줄 줄·모바일 칩 줄 둘 다.
  if (!l2 || l2.section.tabs.length === 0) return null

  return (
    <>
      <nav className="hidden border-b border-border md:flex print:hidden" aria-label="하위 메뉴">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 pt-3 pb-2 sm:px-5 tracking-[-0.01em]">
          {l2.section.tabs.map((tab) => {
            const active = tab.id === l2.activeId
            return (
              // prefetch-ok: L2 탭 — 개수 고정, 이동 잦음
              <Link
                key={tab.id}
                href={buildL2Href(l2.section, tab, pathname, searchParams)}
                className={cn(
                  'whitespace-nowrap border-b-2 pb-1.5 text-[15px] transition-colors',
                  active
                    ? 'border-brand-600 font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* 모바일 전용 — 가로 스크롤 칩 필터(지시서 2026-08-05 Stage 6). 데스크톱 밑줄
          줄과 같은 l2.section.tabs를 쓰므로 id·value·href는 동일, 표시만 다르다.
          스크롤바 숨김은 FeedCarousel.tsx와 동일 패턴. */}
      <nav
        className="flex overflow-x-auto border-b border-border px-4 py-2.5 md:hidden print:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="하위 메뉴(모바일)"
      >
        <div className="flex shrink-0 items-center gap-2">
          {l2.section.tabs.map((tab) => {
            const active = tab.id === l2.activeId
            return (
              // prefetch-ok: L2 탭 — 개수 고정, 이동 잦음
              <Link
                key={tab.id}
                href={buildL2Href(l2.section, tab, pathname, searchParams)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'border border-border text-muted-foreground hover:border-brand-200 hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
