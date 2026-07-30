'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** 회사별(현행) 뷰 — 서버에서 렌더된 노드를 그대로 받아 끼운다(마크업 변경 0) */
  companyView: React.ReactNode
  /** 사업영역별 뷰. 발행된 주간 리포트가 없으면 null — 이 경우 탭 자체를 숨긴다 */
  areaView: React.ReactNode | null
}

/**
 * 467 — 경쟁사 최근 뉴스(전체 페이지) 회사별/사업영역별 탭 래퍼.
 * `CompetitorNewsGroups`·요약 뷰는 건드리지 않고, 이 컴포넌트만 새로 얹는다.
 */
export default function CompetitorNewsTabs({ companyView, areaView }: Props) {
  const [tab, setTab] = useState<'company' | 'area'>('company')

  if (!areaView) return <>{companyView}</>

  return (
    <div>
      <div className="mb-5 flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('company')}
          className={cn(
            'px-3 py-2 text-sm font-medium transition-colors',
            tab === 'company'
              ? 'border-b-2 border-brand-600 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          회사별
        </button>
        <button
          type="button"
          onClick={() => setTab('area')}
          className={cn(
            'px-3 py-2 text-sm font-medium transition-colors',
            tab === 'area'
              ? 'border-b-2 border-brand-600 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          사업영역별
        </button>
      </div>

      <div className={tab === 'company' ? undefined : 'hidden'}>{companyView}</div>
      <div className={tab === 'area' ? undefined : 'hidden'}>{areaView}</div>
    </div>
  )
}
