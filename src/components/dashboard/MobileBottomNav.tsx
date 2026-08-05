'use client'

import Link from 'next/link'
import { Building2, Hash, Home, Layers, Search } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { isTabActive, resolveIssuesActiveHref, ISSUES_L1_HREFS } from '@/components/dashboard/DashboardHeader'
import { cn } from '@/lib/utils'

// 지시서 2026-08-05(Stage 6) — 5탭(검색 FAB 포함) → 4탭 균등으로 재구성. 관계지도·
// 자료실(옛 '리포트')은 DashboardHeader 우측 액션 영역의 모바일 전용 아이콘으로 이동.
// 핵심 인사이트·키워드 분석은 같은 /dashboard/issues 경로를 공유하므로 href만으로는
// 활성 탭을 못 가른다 — DashboardHeader.resolveIssuesActiveHref로 view= 쿼리까지
// 함께 판정해 데스크톱 L1과 어긋나지 않게 한다.
// 지시서 Stage 6-1(2026-08-05) — 헤더 우측이 관계지도·자료실·돋보기·다크모드 4개로
// 붐벼 돋보기(검색)를 다시 이 하단바 중앙의 원형 FAB로 되돌렸다(A안: 4탭 균등은 유지,
// 검색만 바 윗변에 살짝 겹쳐 떠 있는 별도 버튼).
const MOBILE_TABS = [
  { label: '홈', href: '/dashboard', exact: true, icon: Home },
  { label: '핵심 인사이트', href: ISSUES_L1_HREFS.brief, exact: false, icon: Layers },
  { label: '키워드 분석', href: ISSUES_L1_HREFS.keyword, exact: false, icon: Hash },
  { label: '기업동향', href: '/dashboard/entities', exact: false, icon: Building2 },
] as const

export function MobileBottomNav({ onSearchClick }: { onSearchClick: () => void }) {
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
      {/* 검색 FAB — 바 윗변 중앙에 절반 겹쳐 떠 있는 원형 버튼. absolute + -translate-y-1/2로
          4탭 그리드와 무관하게 떠 있으므로 grid-cols-4 균등 배치를 건드리지 않는다.
          z-10으로 그리드(자동 stacking) 위에, ring으로 배경과 분리해 "떠 보이게" 한다. */}
      <button
        type="button"
        onClick={onSearchClick}
        aria-label="검색"
        className="absolute left-1/2 top-0 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-background transition-colors hover:bg-brand-700"
      >
        <Search className="h-5 w-5" aria-hidden />
      </button>

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
