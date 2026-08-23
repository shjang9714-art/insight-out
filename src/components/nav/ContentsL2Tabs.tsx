'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buildL2Href, getL2ForSection } from '@/lib/nav/taxonomy'

/** 헤더의 L2 탭. DashboardHeader가 활성 또는 호버 중인 L1 href를 넘기면,
 *  중앙 정의와 기존 판정 함수만 사용해 해당 섹션을 렌더한다. */
interface Props {
  className?: string
  l1Href: string
}

export default function ContentsL2Tabs({ className, l1Href }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const l2 = getL2ForSection(l1Href, pathname, searchParams)
  if (!l2 || l2.section.tabs.length === 0) return null
  const { section, activeId } = l2

  return (
    <nav
      className={cn('mb-5 flex items-center gap-6 overflow-x-auto tracking-[-0.01em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      aria-label="하위 메뉴"
    >
      {section.tabs.map((tab) => {
        const active = tab.id === activeId
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
