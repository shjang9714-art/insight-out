'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FileText, FlaskConical, Menu, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import SearchBar from '@/components/dashboard/SearchBar'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { cn } from '@/lib/utils'
import { buildL2Href, getL2ForSection } from '@/lib/nav/taxonomy'

// ─── 5탭 네비게이션 정의 ────────────────────────────────────────────────────────

export const NAV_TABS: { label: string; href: string; exact: boolean; icon?: LucideIcon }[] = [
  { label: '홈',        href: '/dashboard',          exact: true  },
  { label: 'AI 인사이트', href: '/dashboard/issues',   exact: false },
  { label: '기업동향',   href: '/dashboard/entities', exact: false },
  { label: '콘텐츠',     href: '/dashboard/contents', exact: false },
  { label: '리포트',     href: '/dashboard/reports',  exact: false, icon: FileText },
]

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
}

export function isTabActive(href: string, exact: boolean, pathname: string): boolean {
  if (exact) return pathname === href
  if (pathname === href || pathname.startsWith(href + '/')) return true
  return (NAV_ALIAS_PREFIXES[href] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
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
  className?: string
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function DashboardHeader({ onMenuClick, className }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const category     = searchParams.get('category') ?? ''
  const pageLabel    = getPageLabel(pathname, category)

  const [userName, setUserName]     = useState<string | null>(null)
  const [userTeam, setUserTeam]     = useState('')
  const [isAdmin, setIsAdmin]       = useState(false)
  // L1 호버 시 그 섹션의 L2를 미리보기(372) — null이면 활성 섹션의 L2로 복귀
  const [previewL1Href, setPreviewL1Href] = useState<string | null>(null)

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
                onMouseEnter={() => setPreviewL1Href(tab.href)}
                onFocus={() => setPreviewL1Href(tab.href)}
                onMouseLeave={() => setPreviewL1Href(null)}
                onBlur={() => setPreviewL1Href(null)}
                className={`inline-flex items-center gap-2 py-1.5 text-[17px] transition-colors ${
                  active
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${active ? 'bg-brand-600' : 'bg-transparent'}`} />
                {tab.icon && <tab.icon className="h-3.5 w-3.5 shrink-0" />}
                <span>{tab.label}</span>
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
        previewL1Href={previewL1Href}
        pathname={pathname}
        searchParams={searchParams}
      />
    </header>
  )
}

// ─── L2 행 ──────────────────────────────────────────────────────────────────
// L1 sticky 헤더 안에 통합해 스크롤해도 함께 고정되고 항상 노출된다(372).
// 호버 중인 L1(previewL1Href)이 있으면 그 섹션을 미리보기, 없으면 실제 활성 섹션을 보여준다.
function L2Row({
  activeL1Href,
  previewL1Href,
  pathname,
  searchParams,
}: {
  activeL1Href: string | null
  previewL1Href: string | null
  pathname: string
  searchParams: URLSearchParams
}) {
  const displayL1Href = previewL1Href ?? activeL1Href
  const l2 = displayL1Href ? getL2ForSection(displayL1Href, pathname, searchParams) : null
  // 프리뷰 중엔 실제 활성 탭이 아니므로 강조하지 않는다(호버=프리뷰, 클릭=확정).
  const isPreview = previewL1Href !== null && previewL1Href !== activeL1Href

  return (
    <nav className="hidden min-h-[30px] md:flex" aria-label="하위 메뉴">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 pt-1 pb-1 sm:px-5 tracking-[-0.01em]">
        {l2 && l2.section.tabs.map((tab) => {
          const active = !isPreview && tab.id === l2.activeId
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
      </div>
    </nav>
  )
}
