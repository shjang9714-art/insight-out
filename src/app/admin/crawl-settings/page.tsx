import type { Metadata } from 'next'
import { Suspense } from 'react'
import CrawlRulesHub from '@/components/admin/CrawlRulesHub'

export const metadata: Metadata = {
  title: '수집 규칙 | 어드민 | Insight Out',
  description: '수집 품질 기준, 제외 규칙, 데이터 보강 재처리를 통합 관리합니다.',
}

// 524 — crawl-settings · exclusion-rules · enrich 통합(AdminTabShell 이식). API 불변.
export default function AdminCrawlRulesPage() {
  return (
    <Suspense fallback={null}>
      <CrawlRulesHub />
    </Suspense>
  )
}
