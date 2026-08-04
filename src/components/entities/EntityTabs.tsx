'use client'

import { useSearchParams } from 'next/navigation'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

// competitor(경쟁사 최근 뉴스)·trend(경쟁사 주간 브리핑)는 실험실로, documents(기업·
// 기술 자료)는 자료실의 "공시자료"로 이관되어(지시서 2026-08-04a/b) 여기서 뺐다 —
// origin=entities로 콘텐츠 상세에 진입했을 때 뜨는 이 보조 탭바에 옛 라벨이 남지
// 않게 하기 위함. 라우트(/dashboard/entities?view=...)는 그대로 살아있다.
export const ENTITY_TABS = [
  { id: 'watchlist',  label: '주요 기업',       href: '/dashboard/entities?view=watchlist' },
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
