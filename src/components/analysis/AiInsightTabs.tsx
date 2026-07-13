'use client'

import { useSearchParams } from 'next/navigation'
import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

// AI인사이트 목록(issues/page.tsx) 사용자 노출 3탭 — 실험실(관리자 전용) 탭은
// DashboardHeader(Lv.1)로 이동해 여기서 다루지 않는다(AiInsightBoard.tsx 참고).
export const AI_INSIGHT_TABS = [
  { id: 'brief',   label: '핵심 인사이트', href: '/dashboard/issues?view=brief' },
  { id: 'keyword', label: '키워드 분석',   href: '/dashboard/issues?view=keyword' },
  { id: 'graph',   label: '관계지도',     href: '/dashboard/issues?view=graph' },
]

interface AiInsightTabsProps {
  /** 상세 페이지 등 URL의 view 쿼리와 무관하게 활성 탭을 고정할 때 사용. 없으면 URL의 view를 읽는다. */
  value?: string
  className?: string
}

export default function AiInsightTabs({ value, className }: AiInsightTabsProps) {
  const searchParams = useSearchParams()
  const view = value ?? searchParams.get('view') ?? 'brief'

  return (
    <NavGroupAlign className={className ?? '-mt-3 mb-6'}>
      <InsightViewTabs items={AI_INSIGHT_TABS} value={view} />
    </NavGroupAlign>
  )
}
