'use client'

import { useSearchParams } from 'next/navigation'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

export const ENTITY_TABS = [
  { id: 'watchlist',  label: '주요 기업',       href: '/dashboard/entities?view=watchlist' },
  { id: 'competitor', label: '경쟁사 최근 뉴스', href: '/dashboard/entities?view=competitor' },
  { id: 'trend',      label: '경쟁사 주간 브리핑', href: '/dashboard/entities?view=trend' },
]

interface EntityTabsProps {
  /** 상세 페이지 등 URL의 view 쿼리와 무관하게 활성 탭을 고정할 때 사용. 없으면 URL의 view를 읽는다. */
  value?: string
  className?: string
}

export default function EntityTabs({ value, className }: EntityTabsProps) {
  const searchParams = useSearchParams()
  const view = value ?? searchParams.get('view') ?? 'watchlist'

  return (
    <NavGroupAlign className={className ?? '-mt-3 mb-6'}>
      <InsightViewTabs items={ENTITY_TABS} value={view} />
    </NavGroupAlign>
  )
}
