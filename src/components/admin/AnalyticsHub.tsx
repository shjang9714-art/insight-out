'use client'

import type { ReactNode } from 'react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import SourceQualityManager from '@/components/admin/SourceQualityManager'

const ANALYTICS_TABS = [
  { value: 'content', label: '콘텐츠 분석' },
  { value: 'source-quality', label: '수집 분석' },
  { value: 'publish', label: '발행 분석' },
  { value: 'ai-cost', label: 'AI 사용량·비용' },
]

interface AnalyticsHubProps {
  contentPanel: ReactNode | null
  publishPanel: ReactNode | null
  aiCostPanel: ReactNode | null
}

/** 524 — 콘텐츠·발행·AI 비용 분석 + 수집 분석 통합. 서버 전용 조회 3건은 활성 탭에 해당하는 것만 슬롯으로 전달받는다. */
export default function AnalyticsHub({ contentPanel, publishPanel, aiCostPanel }: AnalyticsHubProps) {
  return (
    <AdminTabShell
      tabs={ANALYTICS_TABS}
      defaultTab="content"
      aria-label="통계분석"
      renderContent={(tab) => {
        if (tab === 'source-quality') return <SourceQualityManager />
        if (tab === 'publish') return publishPanel
        if (tab === 'ai-cost') return aiCostPanel
        return contentPanel
      }}
    />
  )
}
