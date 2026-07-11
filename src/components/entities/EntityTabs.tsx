'use client'

import { useSearchParams } from 'next/navigation'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

const TABS = [
  { id: 'watchlist',  label: '주요 기업',       href: '/dashboard/entities?view=watchlist' },
  { id: 'competitor', label: '경쟁사 최근 뉴스', href: '/dashboard/entities?view=competitor' },
  { id: 'trend',      label: '경쟁사 주간리포트', href: '/dashboard/entities?view=trend' },
]

export default function EntityTabs() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'watchlist'

  return (
    <NavGroupAlign className="-mt-3 mb-6">
      <InsightViewTabs items={TABS} value={view} />
    </NavGroupAlign>
  )
}
