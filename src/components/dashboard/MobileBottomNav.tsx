'use client'

import Link from 'next/link'
import { Building2, Hash, Home, Layers } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { isTabActive, resolveIssuesActiveHref, ISSUES_L1_HREFS } from '@/components/dashboard/DashboardHeader'
import { cn } from '@/lib/utils'

// 지시서 2026-08-05(Stage 6) — 5탭(검색 FAB 포함) → 4탭 균등으로 재구성. 관계지도·
// 자료실(옛 '리포트')은 DashboardHeader 우측 액션 영역의 모바일 전용 아이콘으로,
// 검색은 헤더 검색 아이콘(SearchOverlay 연결)으로 이동했다. 핵심 인사이트·키워드
// 분석은 같은 /dashboard/issues 경로를 공유하므로 href만으로는 활성 탭을 못 가른다
// — DashboardHeader.resolveIssuesActiveHref로 view= 쿼리까지 함께 판정해 데스크톱
// L1과 어긋나지 않게 한다.
const MOBILE_TABS = [
  { label: '홈', href: '/dashboard', exact: true, icon: Home },
  { label: '핵심 인사이트', href: ISSUES_L1_HREFS.brief, exact: false, icon: Layers },
  { label: '키워드 분석', href: ISSUES_L1_HREFS.keyword, exact: false, icon: Hash },
  { label: '기업동향', href: '/dashboard/entities', exact: false, icon: Building2 },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // /dashboard/issues 계열이 아니거나 view=graph면 null 또는 관계지도 href가 되어
  // 아래 두 탭 어느 것과도 일치하지 않는다 — 자연히 둘 다 비활성(관계지도는 하단바에 없음).
  const issuesActiveHref = resolveIssuesActiveHref(pathname, searchParams)

  return (
    <nav
      aria-label="모바일 주 메뉴"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:hidden print:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-4 px-2">
        {MOBILE_TABS.map((tab) => {
          const active =
            tab.href === ISSUES_L1_HREFS.brief || tab.href === ISSUES_L1_HREFS.keyword
              ? issuesActiveHref === tab.href
              : isTabActive(tab.href, tab.exact, pathname)
          const Icon = tab.icon

          return (
            // prefetch-ok: 모바일 주 네비 — 개수 고정, 이동 잦음
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                active ? 'text-brand-600' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="max-w-full truncate">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
