'use client'

import { useSearchParams } from 'next/navigation'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'

const TABS = [
  { id: 'watchlist',  label: '관심기업',       href: '/dashboard/entities?view=watchlist' },
  { id: 'competitor', label: '경쟁사 최근 뉴스', href: '/dashboard/entities?view=competitor' },
  { id: 'trend',      label: '경쟁사 동향분석', href: '/dashboard/entities?view=trend' },
]

export default function EntityTabs() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'watchlist'

  return (
    <div className="mb-6">
      <InsightViewTabs items={TABS} value={view} className="-mt-3 w-[var(--nav-group-w)]" />
    </div>
  )
}
