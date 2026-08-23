'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { resolveActiveNav } from '@/lib/nav/active'
import { buildL2Href, NAV_SECTIONS } from '@/lib/nav/taxonomy'

/** 자료실 L2(자료종류) 탭 — 이제 header가 아니라 각 페이지의 콘텐츠 영역
 *  안쪽(제목/건수 아래, 목록 위)에서 렌더한다(§지시서 2026-08-12). 자료실
 *  본문(/dashboard/contents)뿐 아니라 aliasing으로 자료실 L1에 편입된
 *  리포트(/dashboard/reports)·공시자료(/dashboard/entities?view=documents)
 *  목록에서도 각 페이지가 이 컴포넌트를 개별적으로 임베드해 동일하게 노출한다
 *  — 한 곳에만 두면 나머지 페이지에서 탭이 사라진다.
 *  스타일은 상단 메인 네비(NAV_TABS)와 같은 계열: 알약/밑줄이 아니라 활성 탭 앞
 *  점 + 굵게, 비활성은 흐린 텍스트. */
interface Props {
  /** 기본은 mb-5. 다른 요소(예: ViewToggle)와 한 줄에 나란히 놓일 때는 바깥 wrapper가
   *  간격을 담당하므로 호출부에서 className="mb-0"으로 덮어쓴다. */
  className?: string
}

export default function ContentsL2Tabs({ className }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { l1Href, l2Id } = resolveActiveNav(pathname, searchParams)
  const section = l1Href ? NAV_SECTIONS[l1Href] : null
  if (!section || !l2Id || section.tabs.length === 0) return null

  return (
    <nav
      className={cn('mb-5 flex items-center gap-6 overflow-x-auto tracking-[-0.01em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      aria-label="자료 종류"
    >
      {section.tabs.map((tab) => {
        const active = tab.id === l2Id
        return (
          // prefetch-ok: L2 탭 — 개수 고정, 이동 잦음
          <Link
            key={tab.id}
            href={buildL2Href(section, tab, pathname, searchParams)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 py-1 text-[14px] transition-colors',
              active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn('h-[5px] w-[5px] shrink-0 rounded-full', active ? 'bg-brand-600' : 'bg-transparent')} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
